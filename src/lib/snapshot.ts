import * as Crypto from 'expo-crypto';

import { addLocalDays, localDateKey, timezoneName } from '@/domain/calendar';
import { questionAssignment } from '@/data/questions';
import type { AccessTier, AppSnapshot, Chapter, ChapterLength, Night } from '@/types';

function visualSeed(id: string) {
  return [...id].reduce((seed, character) => ((seed * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
}

export function makeNights(length: ChapterLength, startDate = localDateKey(), timezone = timezoneName(), existing: Night[] = []) {
  const byIndex = new Map(existing.map((night) => [night.index, night]));
  return Array.from({ length }, (_, offset): Night => {
    const index = offset + 1;
    const previous = byIndex.get(index);
    if (previous) return previous;
    const assignment = questionAssignment(index);
    const id = Crypto.randomUUID();
    return {
      id,
      index,
      expectedLocalDate: addLocalDays(startDate, offset),
      timezone,
      questionId: assignment.questionId,
      questionVersion: assignment.questionVersion,
      status: offset === 0 ? 'today' : 'future',
      visualSeed: visualSeed(id),
      backupState: 'on-device',
    };
  });
}

export function makeChapter(length: ChapterLength = 7): Chapter {
  const now = new Date();
  const timezone = timezoneName();
  const startDate = localDateKey(now);
  return {
    id: Crypto.randomUUID(),
    length,
    targetLength: length,
    accessThrough: length,
    questionSet: 'set_a',
    startedAt: now.toISOString(),
    timezone,
    serverRevision: 0,
    purchaseStatus: 'none',
    nights: makeNights(length, startDate, timezone),
  };
}

export function defaultSnapshot(): AppSnapshot {
  const timezone = timezoneName();
  return {
    schemaVersion: 2,
    onboarded: false,
    reminderHour: 22,
    reminderMinute: 0,
    timezone,
    notificationsEnabled: false,
    notificationPreview: 'private',
    gentleNudge: false,
    authState: 'local',
    accessTier: 'trial',
    backupNetwork: 'wifi-only',
    currentChapter: makeChapter(7),
    completedChapters: [],
    reports: [],
    seenBackupPrompt: false,
    appearance: 'soft-feminine-premium',
  };
}

export function targetForTier(tier: AccessTier): ChapterLength {
  return tier === 'paid90' ? 90 : tier === 'paid30' ? 30 : 7;
}

export function extendChapter(snapshot: AppSnapshot, tier: Extract<AccessTier, 'paid30' | 'paid90'>): AppSnapshot {
  const targetLength = targetForTier(tier);
  const chapter = snapshot.currentChapter;
  const startDate = chapter.nights[0]?.expectedLocalDate ?? localDateKey(new Date(chapter.startedAt));
  return {
    ...snapshot,
    accessTier: tier,
    currentChapter: {
      ...chapter,
      length: targetLength,
      targetLength,
      accessThrough: targetLength,
      purchaseStatus: 'granted',
      nights: makeNights(targetLength, startDate, chapter.timezone, chapter.nights),
    },
  };
}

export function normalizeSnapshot(value: unknown): AppSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const legacy = value as Partial<AppSnapshot> & { currentChapter?: Partial<Chapter> & { nights?: Partial<Night>[] } };
  if (!legacy.currentChapter || !Array.isArray(legacy.currentChapter.nights)) return null;
  if (legacy.schemaVersion === 2 && legacy.currentChapter.nights.every((night) => night.id && night.expectedLocalDate)) {
    return { ...legacy, appearance: 'soft-feminine-premium' } as AppSnapshot;
  }

  const timezone = legacy.timezone ?? timezoneName();
  const startedAt = legacy.currentChapter.startedAt ?? new Date().toISOString();
  const startDate = localDateKey(new Date(startedAt));
  const tier = legacy.accessTier ?? 'trial';
  const targetLength = legacy.currentChapter.length === 90 ? 90 : legacy.currentChapter.length === 30 ? 30 : targetForTier(tier);
  const normalizedNights = legacy.currentChapter.nights.map((night, offset): Night => {
    const index = night.index ?? offset + 1;
    const assignment = questionAssignment(index);
    const id = night.id ?? Crypto.randomUUID();
    return {
      id,
      index,
      expectedLocalDate: night.expectedLocalDate ?? addLocalDays(startDate, offset),
      timezone: night.timezone ?? timezone,
      questionId: night.questionId ?? assignment.questionId,
      questionVersion: night.questionVersion ?? assignment.questionVersion,
      status: night.status ?? 'future',
      recordedAt: night.recordedAt,
      recordedHour: night.recordedHour,
      durationSec: night.durationSec,
      localUri: night.localUri,
      storagePath: night.storagePath,
      checksum: night.checksum,
      byteSize: night.byteSize,
      backedUp: night.backedUp,
      backupState: night.backupState ?? (night.backedUp ? 'backed-up' : night.recordedAt ? 'waiting-account' : 'on-device'),
      revealAt: night.revealAt,
      visualSeed: night.visualSeed ?? visualSeed(id),
    };
  });

  const snapshot = defaultSnapshot();
  return {
    ...snapshot,
    ...legacy,
    schemaVersion: 2,
    timezone,
    backupNetwork: legacy.backupNetwork ?? 'wifi-only',
    notificationPreview: legacy.notificationPreview ?? 'private',
    reports: legacy.reports ?? [],
    currentChapter: {
      ...snapshot.currentChapter,
      ...legacy.currentChapter,
      id: legacy.currentChapter.id ?? Crypto.randomUUID(),
      length: targetLength,
      targetLength: legacy.currentChapter.targetLength ?? targetLength,
      accessThrough: legacy.currentChapter.accessThrough ?? Math.min(targetLength, tier === 'trial' ? 7 : targetLength),
      timezone,
      serverRevision: legacy.currentChapter.serverRevision ?? 0,
      nights: makeNights(targetLength, startDate, timezone, normalizedNights),
    },
  } as AppSnapshot;
}
