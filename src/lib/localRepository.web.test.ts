import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    multiSet: vi.fn(async (entries: [string, string][]) => { entries.forEach(([key, value]) => storage.set(key, value)); }),
    multiRemove: vi.fn(async (keys: string[]) => { keys.forEach((key) => storage.delete(key)); }),
  },
}));

vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(() => '20000000-0000-4000-8000-000000000000'),
}));

vi.mock('@/services/audioFiles', () => ({
  persistRecording: vi.fn(async () => ({ uri: 'blob:recording', byteSize: 2048, checksum: 'a'.repeat(64) })),
}));

import { completeOutboxOperation, failOutboxOperation, pendingOutboxOperations, rebindLocalCloudIdentity, sealNightLocally } from '@/lib/localRepository.web';
import type { AppSnapshot, Night } from '@/types';

function snapshot(): AppSnapshot {
  const active: Night = {
    id: '10000000-0000-4000-8000-000000000001',
    index: 1,
    expectedLocalDate: '2026-08-09',
    timezone: 'Asia/Colombo',
    questionId: 'set_a_01',
    questionVersion: '2026-08-v1',
    status: 'today',
    visualSeed: 1,
  };
  return {
    schemaVersion: 2,
    onboarded: true,
    onboardingVersion: 2,
    reminderHour: 22,
    reminderMinute: 0,
    timezone: 'Asia/Colombo',
    notificationsEnabled: false,
    notificationPreview: 'private',
    gentleNudge: false,
    authState: 'anonymous',
    accessTier: 'trial',
    backupNetwork: 'wifi-only',
    currentChapter: {
      id: '10000000-0000-4000-8000-000000000000',
      length: 7,
      targetLength: 7,
      accessThrough: 7,
      questionSet: 'set_a',
      startedAt: '2026-08-09T00:00:00.000Z',
      timezone: 'Asia/Colombo',
      serverRevision: 1,
      nights: [active],
    },
    completedChapters: [],
    reports: [],
    seenBackupPrompt: false,
    appearance: 'soft-feminine-premium',
  };
}

describe('web seal outbox', () => {
  beforeEach(() => storage.clear());

  it('stores a valid seal operation until synchronization completes', async () => {
    const sealed = await sealNightLocally(snapshot(), { durationSec: 42, temporaryUri: 'blob:recording' });
    const pending = await pendingOutboxOperations();

    expect(sealed.currentChapter.nights[0]).toMatchObject({ status: 'sealed', durationSec: 42, byteSize: 2048 });
    expect(pending).toHaveLength(1);
    expect(JSON.parse(pending[0]!.payload)).toMatchObject({
      nightId: '10000000-0000-4000-8000-000000000001',
      durationSec: 42,
      checksum: 'a'.repeat(64),
      byteSize: 2048,
    });

    await completeOutboxOperation(pending[0]!.operation_id);
    expect(await pendingOutboxOperations()).toEqual([]);
  });

  it('lets an explicit synchronization bypass retry backoff', async () => {
    await sealNightLocally(snapshot(), { durationSec: 42, temporaryUri: 'blob:recording' });
    const [operation] = await pendingOutboxOperations();
    await failOutboxOperation(operation!.operation_id, 0, 'temporary cloud failure');

    expect(await pendingOutboxOperations()).toEqual([]);
    expect(await pendingOutboxOperations(true)).toHaveLength(1);
  });

  it('fails closed when a different cloud owner is adopted', async () => {
    const previous = snapshot();
    previous.ownerId = 'old-owner';
    previous.accessTier = 'paid90';
    previous.processingConsentVersion = 'cloud-processing-v2';
    previous.currentChapter.targetLength = 90;
    previous.currentChapter.length = 90;
    previous.currentChapter.accessThrough = 90;
    previous.currentChapter.purchaseStatus = 'granted';
    previous.currentChapter.nights[0] = {
      ...previous.currentChapter.nights[0]!,
      status: 'sealed',
      recordedAt: '2026-08-09T20:00:00.000Z',
      localUri: 'blob:old-owner-recording',
      checksum: 'b'.repeat(64),
      byteSize: 2048,
      backedUp: true,
      backupState: 'backed-up',
    };
    previous.reports = [{
      id: 'old-report',
      chapterId: previous.currentChapter.id,
      checkpointNight: 7,
      status: 'ready',
      sections: [],
      reportVersion: 'v1',
    }];
    previous.purchaseVerification = {
      plan: 'paid90',
      source: 'home_card',
      status: 'server-verifying',
      updatedAt: '2026-08-09T20:00:00.000Z',
    };

    const next = await rebindLocalCloudIdentity(previous, 'new-owner', 'authenticated', 'new@example.com');

    expect(next).toMatchObject({
      ownerId: 'new-owner',
      authState: 'authenticated',
      email: 'new@example.com',
      accessTier: 'trial',
      completedChapters: [],
      reports: [],
    });
    expect(next.processingConsentVersion).toBeUndefined();
    expect(next.purchaseVerification).toBeUndefined();
    expect(next.currentChapter.id).not.toBe(previous.currentChapter.id);
    expect(next.currentChapter.nights.some((night) => Boolean(night.recordedAt || night.localUri || night.storagePath))).toBe(false);
    expect(await pendingOutboxOperations(true)).toEqual([]);
  });
});
