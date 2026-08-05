import AsyncStorage from '@react-native-async-storage/async-storage';

import { reconcileSnapshot } from '@/domain/calendar';
import { defaultSnapshot, normalizeSnapshot } from '@/lib/snapshot';
import { persistRecording } from '@/services/audioFiles';
import type { AppSnapshot, Night } from '@/types';

const WEB_KEY = 'thirtynights.snapshot.v2';
const LEGACY_KEY = 'thirtynights.snapshot.v1';

export async function initializeLocalState() {
  const current = normalizeSnapshot(JSON.parse((await AsyncStorage.getItem(WEB_KEY)) ?? 'null'));
  if (current) return reconcileSnapshot(current);
  const legacy = normalizeSnapshot(JSON.parse((await AsyncStorage.getItem(LEGACY_KEY)) ?? 'null'));
  const initial = reconcileSnapshot(legacy ?? defaultSnapshot());
  await saveLocalState(initial);
  return initial;
}

export async function saveLocalState(snapshot: AppSnapshot) {
  await AsyncStorage.setItem(WEB_KEY, JSON.stringify(snapshot));
}

export async function sealNightLocally(snapshot: AppSnapshot, params: { durationSec: number; temporaryUri?: string }) {
  const chapter = snapshot.currentChapter;
  const activeNight = chapter.nights.find((night) => night.status === 'today');
  if (!activeNight) throw new Error('Tonight is no longer open.');
  if (params.durationSec < 1 || params.durationSec > 300) throw new Error('Recording duration is outside the supported range.');
  const recordedAt = new Date();
  const file = await persistRecording({ chapterId: chapter.id, nightId: activeNight.id, temporaryUri: params.temporaryUri });
  const sealed: Night = {
    ...activeNight,
    status: 'sealed',
    durationSec: params.durationSec,
    localUri: file.uri,
    recordedAt: recordedAt.toISOString(),
    recordedHour: recordedAt.getHours(),
    checksum: file.checksum,
    byteSize: file.byteSize,
    backedUp: false,
    backupState: 'waiting-account',
  };
  const completed = chapter.nights.filter((night) => night.recordedAt).length + 1;
  const next = reconcileSnapshot({
    ...snapshot,
    currentChapter: {
      ...chapter,
      completedAt: completed === chapter.targetLength ? recordedAt.toISOString() : undefined,
      nights: chapter.nights.map((night) => night.id === sealed.id ? sealed : night),
    },
  });
  await saveLocalState(next);
  return next;
}

export async function pendingOutboxOperations() { return []; }
export async function completeOutboxOperation(_operationId: string) { return; }
export async function failOutboxOperation(_operationId: string, _attempts: number, _error: string) { return; }

export async function clearLocalState() {
  await AsyncStorage.multiRemove([WEB_KEY, LEGACY_KEY]);
}
