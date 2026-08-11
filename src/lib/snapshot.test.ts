import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(() => '20000000-0000-4000-8000-000000000000'),
}));

import { normalizeSnapshot } from '@/lib/snapshot';

const PURCHASE_INTENT = {
  kind: 'purchase' as const,
  plan: 'paid90' as const,
  productId: 'com.thirtynights.nights90',
  source: 'night7_report' as const,
  localizedPrice: '$49.99',
  returnStep: 'store-confirmation' as const,
  resumeToken: 'purchase-continuation-1',
  createdAt: '2026-08-10T20:00:00.000Z',
  expiresAt: '2026-08-10T20:15:00.000Z',
};

const PURCHASE_VERIFICATION = {
  plan: 'paid90' as const,
  source: 'night7_report' as const,
  status: 'pending-approval' as const,
  localizedPrice: '$49.99',
  transactionReference: 'store-transaction-1',
  updatedAt: '2026-08-10T20:01:00.000Z',
};

function storedV2(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    onboarded: true,
    reminderHour: 22,
    reminderMinute: 0,
    timezone: 'Asia/Colombo',
    notificationsEnabled: true,
    notificationPreview: 'private',
    gentleNudge: false,
    authState: 'authenticated',
    ownerId: 'user-1',
    accessTier: 'trial',
    backupNetwork: 'wifi-only',
    currentChapter: {
      id: '10000000-0000-4000-8000-000000000000',
      length: 7,
      targetLength: 7,
      accessThrough: 7,
      questionSet: 'set_a',
      startedAt: '2026-08-04T00:00:00.000Z',
      timezone: 'Asia/Colombo',
      serverRevision: 2,
      purchaseStatus: 'verifying',
      nights: [{
        id: '00000000-0000-4000-8000-000000000001',
        index: 1,
        expectedLocalDate: '2026-08-04',
        timezone: 'Asia/Colombo',
        questionId: 'set_a_01',
        questionVersion: '2026-08-v1',
        status: 'sealed',
        recordedAt: '2026-08-04T20:00:00.000Z',
        durationSec: 42,
        backedUp: true,
        backupState: 'backed-up',
        visualSeed: 1,
      }],
    },
    completedChapters: [],
    reports: [],
    seenBackupPrompt: false,
    appearance: 'soft-feminine-premium',
    ...overrides,
  };
}

describe('stored snapshot normalization', () => {
  it.each([
    [true, 1],
    [false, 2],
  ] as const)('defaults a v2 snapshot with onboarded=%s to onboarding version %s', (onboarded, expectedVersion) => {
    const normalized = normalizeSnapshot(storedV2({ onboarded }));

    expect(normalized?.onboardingVersion).toBe(expectedVersion);
  });

  it('preserves durable conversion, purchase recovery, and consent-withdrawal state', () => {
    const stored = storedV2({
      processingConsentAcceptedAt: '2026-08-05T20:00:00.000Z',
      processingConsentWithdrawnAt: '2026-08-10T19:00:00.000Z',
      reportSetupPromptShownAt: '2026-08-04T20:02:00.000Z',
      unresolvedCheckpoint: 7,
      seenBackupPrompt: true,
      backupPromptShownAt: '2026-08-06T20:00:00.000Z',
      paywallSource: 'night7_report',
      purchaseIntent: PURCHASE_INTENT,
      purchaseVerification: PURCHASE_VERIFICATION,
      purchaseSuccessPending: {
        plan: 'paid90',
        verifiedAt: '2026-08-10T20:02:00.000Z',
      },
      restoreResult: {
        status: 'found',
        store: 'app-store',
        checkedAt: '2026-08-10T20:03:00.000Z',
      },
      lastPurchaseInvitationAt: '2026-08-10T19:30:00.000Z',
    });

    const normalized = normalizeSnapshot(JSON.parse(JSON.stringify(stored)) as unknown);

    expect(normalized).not.toBeNull();
    expect(normalized?.processingConsentVersion).toBeUndefined();
    expect(normalized).toMatchObject({
      onboardingVersion: 1,
      processingConsentAcceptedAt: '2026-08-05T20:00:00.000Z',
      processingConsentWithdrawnAt: '2026-08-10T19:00:00.000Z',
      reportSetupPromptShownAt: '2026-08-04T20:02:00.000Z',
      unresolvedCheckpoint: 7,
      seenBackupPrompt: true,
      backupPromptShownAt: '2026-08-06T20:00:00.000Z',
      paywallSource: 'night7_report',
      purchaseSuccessPending: {
        plan: 'paid90',
        verifiedAt: '2026-08-10T20:02:00.000Z',
      },
      restoreResult: {
        status: 'found',
        store: 'app-store',
        checkedAt: '2026-08-10T20:03:00.000Z',
      },
      lastPurchaseInvitationAt: '2026-08-10T19:30:00.000Z',
    });
    expect(normalized?.purchaseIntent).toEqual(PURCHASE_INTENT);
    expect(normalized?.purchaseVerification).toEqual(PURCHASE_VERIFICATION);
  });

  it('drops a pre-token purchase intent instead of replaying an old checkout', () => {
    const legacyIntent = {
      kind: 'purchase',
      plan: 'paid30',
      source: 'locked_night8',
      localizedPrice: '$9.99',
      createdAt: '2026-08-10T20:00:00.000Z',
    };

    const normalized = normalizeSnapshot(storedV2({ purchaseIntent: legacyIntent }));

    expect(normalized?.purchaseIntent).toBeUndefined();
  });

  it('drops a purchase intent whose executable shape was altered', () => {
    const normalized = normalizeSnapshot(storedV2({
      purchaseIntent: {
        ...PURCHASE_INTENT,
        returnStep: 'restore',
      },
    }));

    expect(normalized?.purchaseIntent).toBeUndefined();
  });

  it('keeps an explicitly stored onboarding version', () => {
    expect(normalizeSnapshot(storedV2({ onboardingVersion: 2 }))?.onboardingVersion).toBe(2);
  });
});
