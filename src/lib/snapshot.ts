import * as Crypto from 'expo-crypto';

import { addLocalDays, localDateKey, timezoneName } from '@/domain/calendar';
import { questionAssignment } from '@/data/questions';
import type { AccessTier, AppSnapshot, Chapter, ChapterLength, Night, PurchaseIntent } from '@/types';

const PURCHASE_INTENT_MAX_LIFETIME_MS = 16 * 60 * 1_000;
const PAYWALL_SOURCES = new Set(['night7_report', 'locked_night8', 'home_card', 'settings_restore']);

/** Stored checkout state is executable state, so accept only the small shape
 * created by the current app. Pre-token intents are deliberately discarded:
 * replaying an old store action is riskier than asking for one fresh tap. */
function normalizePurchaseIntent(value: unknown): PurchaseIntent | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const intent = value as Partial<PurchaseIntent>;
  if (intent.kind !== 'purchase' && intent.kind !== 'restore') return undefined;
  if (intent.plan !== 'paid30' && intent.plan !== 'paid90') return undefined;
  if (typeof intent.source !== 'string' || !PAYWALL_SOURCES.has(intent.source)) return undefined;
  if (intent.returnStep !== (intent.kind === 'restore' ? 'restore' : 'store-confirmation')) return undefined;
  if (typeof intent.resumeToken !== 'string' || !intent.resumeToken.trim()) return undefined;
  if (intent.kind === 'purchase' && (typeof intent.productId !== 'string' || !intent.productId.trim())) return undefined;
  if (typeof intent.createdAt !== 'string' || typeof intent.expiresAt !== 'string') return undefined;
  const createdAt = Date.parse(intent.createdAt);
  const expiresAt = Date.parse(intent.expiresAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return undefined;
  if (expiresAt <= createdAt || expiresAt - createdAt > PURCHASE_INTENT_MAX_LIFETIME_MS) return undefined;
  return {
    kind: intent.kind,
    plan: intent.plan,
    productId: typeof intent.productId === 'string' ? intent.productId : undefined,
    source: intent.source as PurchaseIntent['source'],
    localizedPrice: typeof intent.localizedPrice === 'string' ? intent.localizedPrice : undefined,
    returnStep: intent.returnStep,
    resumeToken: intent.resumeToken,
    createdAt: intent.createdAt,
    expiresAt: intent.expiresAt,
  };
}

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
    onboardingVersion: 2,
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

/**
 * Create the recording-free shell used while a different cloud owner hydrates.
 * Consent, purchases, reports, chapters, and checkout state all belong to the
 * previous identity and must never be carried across that boundary.
 */
export function snapshotForCloudIdentity(
  previous: AppSnapshot,
  ownerId: string,
  authState: AppSnapshot['authState'],
  email?: string,
): AppSnapshot {
  const fresh = defaultSnapshot();
  return {
    ...fresh,
    onboarded: previous.onboarded,
    onboardingVersion: previous.onboardingVersion,
    intentions: previous.intentions,
    reminderHour: previous.reminderHour,
    reminderMinute: previous.reminderMinute,
    timezone: previous.timezone,
    notificationsEnabled: previous.notificationsEnabled,
    notificationPreview: previous.notificationPreview,
    gentleNudge: previous.gentleNudge,
    authState,
    ownerId,
    email,
    backupNetwork: previous.backupNetwork,
    appearance: previous.appearance,
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
    const defaults = defaultSnapshot();
    const purchaseIntent = normalizePurchaseIntent(legacy.purchaseIntent);
    return {
      ...defaults,
      ...legacy,
      onboardingVersion: legacy.onboardingVersion ?? (legacy.onboarded ? 1 : 2),
      purchaseIntent,
      appearance: 'soft-feminine-premium',
    } as AppSnapshot;
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
    onboardingVersion: legacy.onboardingVersion ?? (legacy.onboarded ? 1 : 2),
    timezone,
    backupNetwork: legacy.backupNetwork ?? 'wifi-only',
    notificationPreview: legacy.notificationPreview ?? 'private',
    purchaseIntent: normalizePurchaseIntent(legacy.purchaseIntent),
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
