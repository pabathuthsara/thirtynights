import { File } from 'expo-file-system';
import * as Network from 'expo-network';
import { Platform } from 'react-native';
import { Upload } from 'tus-js-client';

import { reconcileSnapshot } from '@/domain/calendar';
import { completeOutboxOperation, failOutboxOperation, pendingOutboxOperations } from '@/lib/localRepository';
import { attachNightAudio, hydrateFromSupabase, initializeRemoteSchedule, isSupabaseConfigured, permanentUploadIdentity, reconcileRemoteChapter, supabase, syncSealedNight } from '@/lib/supabase';
import type { AppSnapshot, Night } from '@/types';

const STANDARD_LIMIT = 6 * 1024 * 1024;
// Expo/iOS commonly identifies an MPEG-4 audio recording as `audio/x-m4a`.
// The Storage bucket deliberately allows the canonical IANA-style value, so
// never forward the device-reported MIME type to Supabase.
const RECORDING_CONTENT_TYPE = 'audio/m4a';

function isExistingObjectError(error: { message?: string; status?: number | string; statusCode?: number | string }) {
  const message = error.message?.toLowerCase() ?? '';
  return message.includes('already exists') || message.includes('duplicate');
}

function canUpload(snapshot: AppSnapshot, network: Network.NetworkState) {
  if (snapshot.authState !== 'authenticated' || !snapshot.processingConsentVersion || !network.isConnected || network.isInternetReachable === false) return false;
  return snapshot.backupNetwork === 'wifi-and-cellular' || network.type === Network.NetworkStateType.WIFI;
}

async function resumableUpload(path: string, file: File, token: string, checksum: string) {
  const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!projectUrl || !publishableKey) throw new Error('Storage is not configured.');
  const body = new Blob([await file.arrayBuffer()], { type: RECORDING_CONTENT_TYPE });
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(body, {
      endpoint: `${projectUrl}/storage/v1/upload/resumable`,
      headers: { authorization: `Bearer ${token}`, apikey: publishableKey },
      metadata: {
        bucketName: 'recordings', objectName: path, contentType: RECORDING_CONTENT_TYPE, cacheControl: '3600',
        customMetadata: JSON.stringify({ sha256: checksum }),
      },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10_000],
      removeFingerprintOnSuccess: true,
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

async function uploadNight(snapshot: AppSnapshot, night: Night) {
  if (!supabase || !night.localUri || !night.checksum || night.byteSize === undefined || Platform.OS === 'web') return night;
  const file = new File(night.localUri);
  if (!file.exists) return { ...night, backupState: 'attention' as const };
  const identity = await permanentUploadIdentity();
  if (!identity) return { ...night, backupState: 'waiting-account' as const };
  const { user, session } = identity;
  const path = `${user.id}/${snapshot.currentChapter.id}/${night.id}.m4a`;
  if (file.size > STANDARD_LIMIT) {
    await resumableUpload(path, file, session.access_token, night.checksum);
  } else {
    const { error } = await supabase.storage.from('recordings').upload(path, await file.arrayBuffer(), {
      contentType: RECORDING_CONTENT_TYPE, cacheControl: '3600', upsert: false,
      metadata: { sha256: night.checksum },
    });
    // A prior attempt may have uploaded the immutable object and then lost its
    // connection before `attach_night_audio` completed. Continue to attachment
    // in that case instead of trapping the recording in a permanent retry loop.
    if (error && !isExistingObjectError(error)) throw error;
  }
  await attachNightAudio(night.id, path, night.checksum, night.byteSize);
  return { ...night, storagePath: path, backedUp: true, backupState: 'backed-up' as const };
}

export async function synchronize(snapshot: AppSnapshot, options: { ignoreOutboxBackoff?: boolean } = {}) {
  if (snapshot.demoMode) return snapshot;
  if (!isSupabaseConfigured) return snapshot;
  let next = snapshot;
  try {
    await initializeRemoteSchedule(snapshot.currentChapter.timezone, snapshot.currentChapter.nights[0]?.expectedLocalDate ?? snapshot.currentChapter.startedAt.slice(0, 10));
  } catch { /* Existing sealed server schedules are intentionally immutable. */ }
  try { await reconcileRemoteChapter(); } catch { /* Local reconciliation remains authoritative for offline ritual access. */ }
  const operations = await pendingOutboxOperations(options.ignoreOutboxBackoff);
  for (const operation of operations) {
    try {
      await syncSealedNight(operation.operation_id, JSON.parse(operation.payload) as Record<string, unknown>);
      await completeOutboxOperation(operation.operation_id);
    } catch (error) {
      await failOutboxOperation(operation.operation_id, operation.attempts, error instanceof Error ? error.message : 'Metadata sync failed.');
    }
  }

  const network = await Network.getNetworkStateAsync();
  if (canUpload(next, network)) {
    const nights = [] as Night[];
    for (const night of next.currentChapter.nights) {
      if (night.recordedAt && !night.backedUp && night.localUri) {
        try { nights.push(await uploadNight(next, { ...night, backupState: 'uploading' })); }
        catch { nights.push({ ...night, backupState: 'attention' }); }
      } else nights.push(night);
    }
    next = { ...next, currentChapter: { ...next.currentChapter, nights } };
  } else if (next.authState === 'authenticated') {
    next = {
      ...next,
      currentChapter: {
        ...next.currentChapter,
        nights: next.currentChapter.nights.map((night) => night.recordedAt && !night.backedUp
          ? { ...night, backupState: next.processingConsentVersion ? 'waiting-wifi' as const : 'waiting-account' as const }
          : night),
      },
    };
  }

  try { next = await hydrateFromSupabase(next); } catch { /* Cached local entities remain safe offline. */ }
  // Temporal states are derived from the device's current civil date. The
  // server can legitimately still return yesterday's persisted `future` state
  // (or the RPC may be temporarily unavailable), so never let hydration
  // overwrite a locally-open night with stale cloud status.
  next = reconcileSnapshot(next);
  return next;
}
