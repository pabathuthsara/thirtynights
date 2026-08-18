import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const uploadedPaths = vi.hoisted(() => [] as string[]);
const attachedPaths = vi.hoisted(() => [] as Array<{ nightId: string; path: string }>);
const reportedIssues = vi.hoisted(() => [] as Array<{ stage: string; message: string }>);
const platform = vi.hoisted(() => ({ OS: 'ios' }));

vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-network', () => ({
  NetworkStateType: { WIFI: 'WIFI' },
  getNetworkStateAsync: vi.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
    type: 'WIFI',
  })),
}));
vi.mock('expo-file-system', () => ({
  File: class {
    exists = true;
    size = 2_048;
    constructor(readonly uri: string) {}
    async arrayBuffer() { return new Uint8Array([1, 2, 3]).buffer; }
  },
}));
vi.mock('tus-js-client', () => ({ Upload: class {} }));
vi.mock('@/lib/localRepository', () => ({
  pendingOutboxOperations: vi.fn(async () => []),
  completeOutboxOperation: vi.fn(async () => undefined),
  failOutboxOperation: vi.fn(async () => undefined),
}));
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  initializeRemoteSchedule: vi.fn(async () => undefined),
  reconcileRemoteChapter: vi.fn(async () => undefined),
  syncSealedNight: vi.fn(async () => undefined),
  hydrateFromSupabase: vi.fn(async (snapshot) => snapshot),
  permanentUploadIdentity: vi.fn(async () => ({
    user: { id: 'user-1' },
    session: { access_token: 'token-1' },
  })),
  attachNightAudio: vi.fn(async (nightId: string, path: string) => {
    attachedPaths.push({ nightId, path });
  }),
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string) => {
          uploadedPaths.push(path);
          return { error: null };
        }),
      })),
    },
  },
}));

import { pendingOutboxOperations } from '@/lib/localRepository';
import { syncSealedNight } from '@/lib/supabase';
import { synchronize } from '@/services/sync';
import type { AppSnapshot, Chapter, Night } from '@/types';

function recordedNight(id: string, index: number): Night {
  return {
    id,
    index,
    expectedLocalDate: '2026-08-10',
    timezone: 'Asia/Colombo',
    questionId: `question-${index}`,
    questionVersion: 'v1',
    status: 'sealed',
    recordedAt: '2026-08-10T20:00:00.000Z',
    recordedHour: 20,
    durationSec: 42,
    localUri: `file://${id}.m4a`,
    checksum: 'a'.repeat(64),
    byteSize: 2_048,
    backedUp: false,
    backupState: 'waiting-wifi',
    visualSeed: index,
  };
}

function chapter(id: string, night: Night, completed = false): Chapter {
  return {
    id,
    length: 7,
    targetLength: 7,
    accessThrough: 7,
    questionSet: 'set_a',
    startedAt: '2026-08-10T00:00:00.000Z',
    timezone: 'Asia/Colombo',
    serverRevision: 1,
    completedAt: completed ? '2026-08-10T21:00:00.000Z' : undefined,
    nights: [night],
  };
}

function snapshot(): AppSnapshot {
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
    authState: 'authenticated',
    ownerId: 'user-1',
    accessTier: 'trial',
    backupNetwork: 'wifi-only',
    processingConsentVersion: 'cloud-processing-v2',
    currentChapter: chapter('current-chapter', recordedNight('current-night', 1)),
    completedChapters: [chapter('completed-chapter', recordedNight('completed-night', 1), true)],
    reports: [],
    seenBackupPrompt: false,
    appearance: 'soft-feminine-premium',
  };
}

describe('recording synchronization', () => {
  beforeEach(() => {
    platform.OS = 'ios';
    uploadedPaths.length = 0;
    attachedPaths.length = 0;
    reportedIssues.length = 0;
    vi.mocked(pendingOutboxOperations).mockResolvedValue([]);
    vi.mocked(syncSealedNight).mockResolvedValue({ chapter_id: 'server-chapter', night_id: 'server-night' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('backs up device-only recordings from current and completed chapters using their own paths', async () => {
    const result = await synchronize(snapshot(), { ignoreOutboxBackoff: true });

    expect(uploadedPaths).toEqual([
      'user-1/current-chapter/current-night.m4a',
      'user-1/completed-chapter/completed-night.m4a',
    ]);
    expect(attachedPaths).toEqual([
      { nightId: 'current-night', path: 'user-1/current-chapter/current-night.m4a' },
      { nightId: 'completed-night', path: 'user-1/completed-chapter/completed-night.m4a' },
    ]);
    expect(result.currentChapter.nights[0]?.backedUp).toBe(true);
    expect(result.completedChapters[0]?.nights[0]?.backedUp).toBe(true);
  });

  it('backs up browser Blob recordings instead of treating web as offline', async () => {
    platform.OS = 'web';
    const fetchRecording = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchRecording);
    const browserSnapshot = snapshot();
    browserSnapshot.currentChapter.nights[0]!.localUri = 'blob:current-night';
    browserSnapshot.completedChapters[0]!.nights[0]!.localUri = 'blob:completed-night';

    const result = await synchronize(browserSnapshot, { ignoreOutboxBackoff: true });

    expect(fetchRecording).toHaveBeenCalledTimes(2);
    expect(uploadedPaths).toHaveLength(2);
    expect(result.currentChapter.nights[0]?.backedUp).toBe(true);
    expect(result.completedChapters[0]?.nights[0]?.backedUp).toBe(true);
  });

  it('explains when a page reload has invalidated a browser Blob recording', async () => {
    platform.OS = 'web';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const browserSnapshot = snapshot();
    browserSnapshot.completedChapters = [];
    browserSnapshot.currentChapter.nights[0]!.localUri = 'blob:expired-recording';

    const result = await synchronize(browserSnapshot, {
      ignoreOutboxBackoff: true,
      onIssue: (issue) => reportedIssues.push(issue),
    });

    expect(uploadedPaths).toEqual([]);
    expect(result.currentChapter.nights[0]?.backedUp).toBe(false);
    expect(reportedIssues).toEqual([{
      stage: 'audio',
      message: expect.stringContaining('no longer available after the page reloaded'),
    }]);
  });

  it('does not upload audio until its sealed metadata is accepted', async () => {
    vi.mocked(pendingOutboxOperations).mockResolvedValueOnce([{
      operation_id: 'operation-1',
      entity_id: 'current-night',
      operation: 'seal',
      payload: '{}',
      attempts: 0,
    }]);
    vi.mocked(syncSealedNight).mockRejectedValueOnce(new Error('metadata unavailable'));

    const result = await synchronize(snapshot(), {
      ignoreOutboxBackoff: true,
      onIssue: (issue) => reportedIssues.push(issue),
    });

    expect(uploadedPaths).toEqual([]);
    expect(attachedPaths).toEqual([]);
    expect(result.currentChapter.nights[0]?.backedUp).toBe(false);
    expect(reportedIssues).toEqual([expect.objectContaining({ stage: 'metadata' })]);
  });
});
