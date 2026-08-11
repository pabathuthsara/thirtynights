import { describe, expect, it, vi } from 'vitest';

const purchaseSdk = vi.hoisted(() => ({
  setLogLevel: vi.fn(),
  configure: vi.fn(),
  logIn: vi.fn(async () => undefined),
  logOut: vi.fn(async () => undefined),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-crypto', () => ({ randomUUID: vi.fn(() => 'resume-token-1') }));
vi.mock('react-native-purchases', () => ({
  default: purchaseSdk,
  LOG_LEVEL: { DEBUG: 'DEBUG', ERROR: 'ERROR' },
  PRODUCT_CATEGORY: { NON_SUBSCRIPTION: 'NON_SUBSCRIPTION' },
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: '1',
    PRODUCT_ALREADY_PURCHASED_ERROR: '6',
    PAYMENT_PENDING_ERROR: '20',
  },
}));

import {
  canClearVerificationAfterRestoreNotFound,
  clearCommerceIdentity,
  classifyPurchaseError,
  configureCommerce,
  createPurchaseIntent,
  isAbandonablePreStoreVerification,
  isAuthoritativePurchaseVerification,
  isPurchaseIntentResumable,
  PURCHASE_INTENT_TTL_MS,
} from '@/services/commerce';
import type { PurchaseVerification } from '@/types';

const now = Date.parse('2026-08-10T20:00:00.000Z');

function verification(status: PurchaseVerification['status'], extras: Partial<PurchaseVerification> = {}): PurchaseVerification {
  return {
    plan: 'paid30',
    source: 'home_card',
    status,
    updatedAt: '2026-08-10T20:00:00.000Z',
    ...extras,
  };
}

describe('RevenueCat purchase recovery', () => {
  it.each([
    [{ code: '1' }, 'cancelled'],
    [{ userCancelled: true }, 'cancelled'],
    [{ code: '20' }, 'pending'],
    [{ code: '6' }, 'already-purchased'],
  ] as const)('classifies the SDK outcome %o as %s', (error, expected) => {
    expect(classifyPurchaseError(error)).toBe(expected);
  });

  it('does not infer pending from free-form error text', () => {
    expect(classifyPurchaseError({ code: '0', message: 'payment_pending-ish' })).toBeUndefined();
  });

  it('detaches the SDK identity before a device reset', async () => {
    const previousKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'appl_test_key';
    try {
      await configureCommerce('owner-1');
      await clearCommerceIdentity();
      expect(purchaseSdk.configure).toHaveBeenCalledWith(expect.objectContaining({ appUserID: 'owner-1' }));
      expect(purchaseSdk.logOut).toHaveBeenCalledTimes(1);
    } finally {
      if (previousKey === undefined) delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
      else process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = previousKey;
    }
  });
});

describe('durable purchase continuation', () => {
  it('creates a short-lived, nonce-bound intent for the exact store item', () => {
    const intent = createPurchaseIntent({
      kind: 'purchase',
      plan: 'paid90',
      productId: 'com.thirtynights.nights90',
      source: 'night7_report',
      localizedPrice: '$49.99',
    }, now);

    expect(intent).toMatchObject({
      returnStep: 'store-confirmation',
      resumeToken: 'resume-token-1',
      createdAt: '2026-08-10T20:00:00.000Z',
      expiresAt: '2026-08-10T20:15:00.000Z',
    });
    expect(isPurchaseIntentResumable(intent, now + PURCHASE_INTENT_TTL_MS - 1)).toBe(true);
    expect(isPurchaseIntentResumable(intent, now + PURCHASE_INTENT_TTL_MS)).toBe(false);
  });

  it('rejects a replay whose executable product or return step is missing', () => {
    const intent = createPurchaseIntent({
      kind: 'purchase',
      plan: 'paid30',
      productId: 'com.thirtynights.nights30',
      source: 'locked_night8',
      localizedPrice: '$9.99',
    }, now);

    expect(isPurchaseIntentResumable({ ...intent, productId: undefined }, now)).toBe(false);
    expect(isPurchaseIntentResumable({ ...intent, returnStep: 'restore' }, now)).toBe(false);
  });
});

describe('verification state boundaries', () => {
  it('polls only authoritative post-store states', () => {
    expect(isAuthoritativePurchaseVerification(verification('server-verifying'))).toBe(true);
    expect(isAuthoritativePurchaseVerification(verification('pending-approval'))).toBe(true);
    expect(isAuthoritativePurchaseVerification(verification('store-confirming'))).toBe(false);
    expect(isAuthoritativePurchaseVerification(verification('failed'))).toBe(false);
  });

  it('allows abandonment only before a durable store outcome', () => {
    const preStore = verification('store-confirming');
    expect(isAbandonablePreStoreVerification(preStore)).toBe(true);
    expect(isAbandonablePreStoreVerification({ ...preStore, transactionReference: 'transaction-1' })).toBe(false);
    expect(canClearVerificationAfterRestoreNotFound(preStore)).toBe(true);
    expect(canClearVerificationAfterRestoreNotFound(verification('failed'))).toBe(true);
    expect(canClearVerificationAfterRestoreNotFound(verification('pending-approval'))).toBe(false);
  });
});
