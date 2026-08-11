import { File } from 'expo-file-system';
import * as Network from 'expo-network';
import { Platform } from 'react-native';
import { Upload } from 'tus-js-client';

import { reconcileSnapshot } from '@/domain/calendar';
import { completeOutboxOperation, failOutboxOperation, pendingOutboxOperations } from '@/lib/localRepository';
import { attachNightAudio, hydrateFromSupabase, initializeRemoteSchedule, isSupabaseConfigured, permanentUploadIdentity, reconcileRemoteChapter, supabase, syncSealedNight } from '@/lib/supabase';
import type { AppSnapshot, Chapter, Night } from '@/types';

export type SyncIssue = {
  stage: 'metadata' | 'audio' | 'hydrate';
  message: string;
};

const STANDARD_LIMIT = 6 * 1024 * 1024;
// Expo/iOS commonly identifies an MPEG-4 audio recording as `audio/x-m4a`.
// The Storage bucket deliberately allows the canonical IANA-style value, so
// never forward the device-reported MIME type to Supabase.
const RECORDING_CONTENT_TYPE = 'audio/m4a';

function isExistingObjectError(error: { message?: string; status?: number | string; statusCode?: number | string }) {
  const message = error.message?.toLowerCase() ?? '';
  return message.includes('already exists') || message.includes('duplicate');
}

function syncIssue(stage: SyncIssue['stage'], error: unknown): SyncIssue {
  const detail = typeof error === 'object' && error
    ? error as { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown }
    : undefined;
  const message = typeof detail?.message === 'string' ? detail.message.toLowerCase() : '';
  const code = typeof detail?.code === 'string' ? detail.code.toLowerCase() : '';
  const status = Number(detail?.status ?? detail?.statusCode);

  if (status === 401 || status === 403 || code.includes('jwt') || message.includes('row-level security') || message.includes('unauthorized')) {
    return { stage, message: 'Your cloud session could not authorize this backup. Reconnect your account, then try again; the recording is still safe on this phone.' };
  }
  if (status === 404 || code === 'pgrst116' || message.includes('not found')) {
    return { stage, message: 'This night could not be matched to your cloud schedule. Refresh your account and try again; the recording is still safe on this phone.' };
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('timed out') || message.includes('timeout')) {
    return { stage, message: 'Secure storage could not be reached. Check your connection and try again; the recording remains on this phone.' };
  }
  return {
    stage,
    message: stage === 'audio'
      ? 'Secure storage did not accept the recording. It remains safe on this phone; retry in a moment or contact support if this continues.'
      : 'Cloud synchronization did not finish. Your local recording is safe; retry in a moment or contact support if this continues.',
  };
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

async function uploadNight(chapterId: string, night: Night) {
  if (!supabase || !night.localUri || !night.checksum || night.byteSize === undefined || Platform.OS === 'web') return night;
  const file = new File(night.localUri);
  if (!file.exists) return { ...night, backupState: 'attention' as const };
  const identity = await permanentUploadIdentity();
  if (!identity) return { ...night, backupState: 'waiting-account' as const };
  const { user, session } = identity;
  const path = `${user.id}/${chapterId}/${night.id}.m4a`;
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

export async function synchronize(snapshot: AppSnapshot, options: {
  ignoreOutboxBackoff?: boolean;
  onIssue?: (issue: SyncIssue) => void;
} = {}) {
  if (snapshot.demoMode) return snapshot;
  if (!isSupabaseConfigured) return snapshot;
  let next = snapshot;
  try {
    await initializeRemoteSchedule(snapshot.currentChapter.timezone, snapshot.currentChapter.nights[0]?.expectedLocalDate ?? snapshot.currentChapter.startedAt.slice(0, 10));
  } catch { /* Existing sealed server schedules are intentionally immutable. */ }
  try { await reconcileRemoteChapter(); } catch { /* Local reconciliation remains authoritative for offline ritual access. */ }
  const operations = await pendingOutboxOperations(options.ignoreOutboxBackoff);
  let metadataFailed = false;
  for (const operation of operations) {
    try {
      await syncSealedNight(operation.operation_id, JSON.parse(operation.payload) as Record<string, unknown>);
      await completeOutboxOperation(operation.operation_id);
    } catch (error) {
      metadataFailed = true;
      options.onIssue?.(syncIssue('metadata', error));
      await failOutboxOperation(operation.operation_id, operation.attempts, error instanceof Error ? error.message : 'Metadata sync failed.');
    }
  }

  // A locally created chapter and its server row intentionally start with
  // different UUIDs. Once sealed metadata is attached, hydrate the server
  // chapter/client-night IDs before constructing immutable Storage paths.
  // This turns the first online pass after an offline seal into one complete
  // synchronization instead of an avoidable failed upload followed by retry.
  try { next = await hydrateFromSupabase(next); } catch {
    // This is a preparatory read used to translate local client IDs to their
    // server-owned night IDs. The authoritative hydration below reports a
    // real issue if the cloud is still unavailable at the end of the pass.
  }

  const network = await Network.getNetworkStateAsync();
  if (!metadataFailed && canUpload(next, network)) {
    const uploadChapter = async (chapter: Chapter): Promise<Chapter> => {
      const nights = [] as Night[];
      for (const night of chapter.nights) {
        if (night.recordedAt && !night.backedUp && night.localUri) {
          try { nights.push(await uploadNight(chapter.id, { ...night, backupState: 'uploading' })); }
          catch (error) {
            options.onIssue?.(syncIssue('audio', error));
            nights.push({ ...night, backupState: 'attention' });
          }
        } else nights.push(night);
      }
      return { ...chapter, nights };
    };
    const currentChapter = await uploadChapter(next.currentChapter);
    const completedChapters: Chapter[] = [];
    for (const chapter of next.completedChapters) completedChapters.push(await uploadChapter(chapter));
    next = { ...next, currentChapter, completedChapters };
  } else if (next.authState === 'authenticated') {
    const waitingChapter = (chapter: Chapter): Chapter => ({
      ...chapter,
      nights: chapter.nights.map((night) => night.recordedAt && !night.backedUp
        ? { ...night, backupState: next.processingConsentVersion ? 'waiting-wifi' as const : 'waiting-account' as const }
        : night),
    });
    next = {
      ...next,
      currentChapter: waitingChapter(next.currentChapter),
      completedChapters: next.completedChapters.map(waitingChapter),
    };
  }

  try { next = await hydrateFromSupabase(next); } catch (error) {
    options.onIssue?.(syncIssue('hydrate', error));
    // Cached local entities remain safe offline.
  }
  // Temporal states are derived from the device's current civil date. The
  // server can legitimately still return yesterday's persisted `future` state
  // (or the RPC may be temporarily unavailable), so never let hydration
  // overwrite a locally-open night with stale cloud status.
  next = reconcileSnapshot(next);
  return next;
}
