import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { reconcileSnapshot } from '@/domain/calendar';
import { defaultSnapshot, normalizeSnapshot, snapshotForCloudIdentity } from '@/lib/snapshot';
import { persistRecording } from '@/services/audioFiles';
import type { AppSnapshot, Night } from '@/types';

const WEB_KEY = 'thirtynights.snapshot.v2';
const LEGACY_KEY = 'thirtynights.snapshot.v1';
const OUTBOX_KEY = 'thirtynights.outbox.web.v1';
let webWriteQueue: Promise<void> = Promise.resolve();

type WebOutboxOperation = {
  operation_id: string;
  entity_id: string;
  operation: string;
  payload: string;
  attempts: number;
  next_attempt_at: string;
  last_error?: string;
};

function serializeWebWrite(operation: () => Promise<void>) {
  const result = webWriteQueue.then(operation, operation);
  webWriteQueue = result.catch(() => undefined);
  return result;
}

async function readOutbox() {
  return JSON.parse((await AsyncStorage.getItem(OUTBOX_KEY)) ?? '[]') as WebOutboxOperation[];
}

function sealPayload(snapshot: AppSnapshot, sealed: Night) {
  return JSON.stringify({
    chapterId: snapshot.currentChapter.id,
    nightId: sealed.id,
    index: sealed.index,
    expectedLocalDate: sealed.expectedLocalDate,
    timezone: sealed.timezone,
    questionId: sealed.questionId,
    questionVersion: sealed.questionVersion,
    recordedAt: sealed.recordedAt,
    recordedHour: sealed.recordedHour,
    durationSec: sealed.durationSec,
    checksum: sealed.checksum,
    byteSize: sealed.byteSize,
  });
}

export async function initializeLocalState() {
  const current = normalizeSnapshot(JSON.parse((await AsyncStorage.getItem(WEB_KEY)) ?? 'null'));
  if (current) return reconcileSnapshot(current);
  const legacy = normalizeSnapshot(JSON.parse((await AsyncStorage.getItem(LEGACY_KEY)) ?? 'null'));
  const initial = reconcileSnapshot(legacy ?? defaultSnapshot());
  await saveLocalState(initial);
  return initial;
}

export async function saveLocalState(snapshot: AppSnapshot) {
  await serializeWebWrite(() => AsyncStorage.setItem(WEB_KEY, JSON.stringify(snapshot)));
}

export async function rebindLocalCloudIdentity(
  snapshot: AppSnapshot,
  ownerId: string,
  authState: AppSnapshot['authState'],
  email?: string,
) {
  if (!snapshot.ownerId || snapshot.ownerId === ownerId) {
    return { ...snapshot, ownerId, authState, email };
  }
  const next = snapshotForCloudIdentity(snapshot, ownerId, authState, email);
  await serializeWebWrite(() => AsyncStorage.multiSet([
    [WEB_KEY, JSON.stringify(next)],
    [OUTBOX_KEY, JSON.stringify([])],
  ]));
  return next;
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
  const operationId = Crypto.randomUUID();
  const operation: WebOutboxOperation = {
    operation_id: operationId,
    entity_id: sealed.id,
    operation: 'seal',
    payload: sealPayload(next, sealed),
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
  };
  await serializeWebWrite(async () => {
    const outbox = await readOutbox();
    await AsyncStorage.multiSet([
      [WEB_KEY, JSON.stringify(next)],
      [OUTBOX_KEY, JSON.stringify([...outbox, operation])],
    ]);
  });
  return next;
}

export async function pendingOutboxOperations(ignoreBackoff = false) {
  await webWriteQueue;
  const now = new Date().toISOString();
  return (await readOutbox())
    .filter((operation) => ignoreBackoff || operation.next_attempt_at <= now)
    .slice(0, 10);
}

export async function completeOutboxOperation(operationId: string) {
  await serializeWebWrite(async () => {
    const outbox = await readOutbox();
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox.filter((operation) => operation.operation_id !== operationId)));
  });
}

export async function failOutboxOperation(operationId: string, attempts: number, error: string) {
  await serializeWebWrite(async () => {
    const outbox = await readOutbox();
    const delay = Math.min(3600, 2 ** Math.min(attempts + 1, 10) * 5) * 1000;
    const next = outbox.map((operation) => operation.operation_id === operationId
      ? {
          ...operation,
          attempts: attempts + 1,
          next_attempt_at: new Date(Date.now() + delay + Math.random() * 3000).toISOString(),
          last_error: error.slice(0, 300),
        }
      : operation);
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(next));
  });
}

export async function clearLocalState() {
  await serializeWebWrite(() => AsyncStorage.multiRemove([WEB_KEY, LEGACY_KEY, OUTBOX_KEY]));
}
