import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import Purchases, {
  LOG_LEVEL,
  PRODUCT_CATEGORY,
  PURCHASES_ERROR_CODE,
  type PurchasesError,
  type PurchasesStoreProduct,
} from 'react-native-purchases';
import type { PaywallSource, ProductPlan, PurchaseIntent, PurchaseVerification } from '@/types';

export type { ProductPlan } from '@/types';
export type CommerceProduct = {
  plan: ProductPlan;
  identifier: string;
  title: string;
  description: string;
  localizedPrice: string;
  storeProduct: PurchasesStoreProduct;
};

export const PURCHASE_INTENT_TTL_MS = 15 * 60 * 1_000;
const PURCHASE_INTENT_CLOCK_SKEW_MS = 60 * 1_000;

export function createPurchaseIntent({
  kind,
  plan,
  productId,
  source,
  localizedPrice,
}: {
  kind: PurchaseIntent['kind'];
  plan: ProductPlan;
  productId?: string;
  source: PaywallSource;
  localizedPrice?: string;
}, now = Date.now()): PurchaseIntent {
  if (kind === 'purchase' && !productId) {
    throw new Error('A store product is required before checkout can continue.');
  }
  return {
    kind,
    plan,
    productId,
    source,
    localizedPrice,
    returnStep: kind === 'restore' ? 'restore' : 'store-confirmation',
    resumeToken: Crypto.randomUUID(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PURCHASE_INTENT_TTL_MS).toISOString(),
  };
}

/** A purchase choice is short-lived so reopening the app cannot silently
 * replay an old store sheet. The persisted product and localized price are
 * checked again by the paywall before the intent is consumed. */
export function isPurchaseIntentResumable(intent: PurchaseIntent | undefined, now = Date.now()) {
  if (!intent?.resumeToken.trim()) return false;
  if (intent.returnStep !== (intent.kind === 'restore' ? 'restore' : 'store-confirmation')) return false;
  if (intent.kind === 'purchase' && !intent.productId?.trim()) return false;
  const createdAt = Date.parse(intent.createdAt);
  const expiresAt = Date.parse(intent.expiresAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return false;
  if (createdAt > now + PURCHASE_INTENT_CLOCK_SKEW_MS || expiresAt <= now || expiresAt <= createdAt) return false;
  return expiresAt - createdAt <= PURCHASE_INTENT_TTL_MS + PURCHASE_INTENT_CLOCK_SKEW_MS;
}

export function isAuthoritativePurchaseVerification(
  verification?: PurchaseVerification,
): verification is PurchaseVerification & { status: 'server-verifying' | 'pending-approval' } {
  return verification?.status === 'server-verifying' || verification?.status === 'pending-approval';
}

export function isAbandonablePreStoreVerification(
  verification?: PurchaseVerification,
): verification is PurchaseVerification & { status: 'store-confirming' } {
  return verification?.status === 'store-confirming'
    && !verification.storeConfirmedAt
    && !verification.transactionReference;
}

export function canClearVerificationAfterRestoreNotFound(verification?: PurchaseVerification) {
  return !verification || verification.status === 'failed' || isAbandonablePreStoreVerification(verification);
}

export type PurchaseErrorOutcome = 'cancelled' | 'pending' | 'already-purchased';

export function classifyPurchaseError(error: unknown): PurchaseErrorOutcome | undefined {
  const purchaseError = error as Partial<PurchasesError>;
  if (purchaseError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || purchaseError.userCancelled === true) {
    return 'cancelled';
  }
  if (purchaseError.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
  if (purchaseError.code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR) return 'already-purchased';
  return undefined;
}

const PRODUCT_IDS: Record<ProductPlan, string> = {
  paid30: process.env.EXPO_PUBLIC_NIGHTS_30_PRODUCT_ID || 'com.thirtynights.nights30',
  paid90: process.env.EXPO_PUBLIC_NIGHTS_90_PRODUCT_ID || 'com.thirtynights.nights90',
};

let configured = false;
let identifiedAs: string | null = null;

function apiKey() {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  return undefined;
}

export function isCommerceConfigured() {
  const key = apiKey();
  return Boolean(key && !key.includes('replace_me') && Platform.OS !== 'web');
}

/**
 * Bring the store up, with an owner if we have one and anonymously if we do not.
 *
 * Reading prices must never require an account. It used to: the paywall only
 * fetched products once `authState === 'authenticated'`, so the first person to
 * ever open it saw two tiers labelled "Account required" and no price at all.
 * That is a conversion hole and a review risk in one — both stores expect the
 * real, localized, store-matched price to be legible on the screen that asks
 * for money. RevenueCat is happy to run under an anonymous app user ID and to
 * be handed the real one later via `logIn`, which is what this does.
 */
async function ensureConfigured(userId?: string) {
  if (!isCommerceConfigured()) return false;
  if (!configured) {
    Purchases.setLogLevel(typeof __DEV__ !== 'undefined' && __DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    Purchases.configure(userId ? { apiKey: apiKey()!, appUserID: userId } : { apiKey: apiKey()! });
    configured = true;
    identifiedAs = userId ?? null;
    return true;
  }
  if (userId && identifiedAs !== userId) {
    await Purchases.logIn(userId);
    identifiedAs = userId;
  }
  return true;
}

export async function configureCommerce(userId: string) {
  return ensureConfigured(userId);
}

/** Detach the store SDK from the account before local data is erased. Leaving
 * RevenueCat identified as the previous owner could let a newly-created local
 * journey read that owner's customer state until the next successful login. */
export async function clearCommerceIdentity() {
  if (!configured || !identifiedAs) return;
  await Purchases.logOut();
  identifiedAs = null;
}

export async function loadCommerceProducts(userId?: string) {
  if (!await ensureConfigured(userId)) return [];
  const products = await Purchases.getProducts(Object.values(PRODUCT_IDS), PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  return products.flatMap((product): CommerceProduct[] => {
    const plan = (Object.entries(PRODUCT_IDS).find(([, id]) => id === product.identifier)?.[0]) as ProductPlan | undefined;
    return plan ? [{
      plan,
      identifier: product.identifier,
      title: product.title,
      description: product.description,
      localizedPrice: product.priceString,
      storeProduct: product,
    }] : [];
  });
}

export async function purchaseCommerceProduct(userId: string, product: CommerceProduct) {
  await configureCommerce(userId);
  try {
    const result = await Purchases.purchaseStoreProduct(product.storeProduct);
    return { status: 'server-verifying' as const, transaction: result.transaction };
  } catch (error) {
    const outcome = classifyPurchaseError(error);
    if (outcome === 'cancelled') return { status: 'cancelled' as const };
    if (outcome === 'pending') return { status: 'pending' as const };
    if (outcome === 'already-purchased') return { status: 'already-purchased' as const };
    const purchaseError = error as Partial<PurchasesError>;
    throw new Error(purchaseError.message || 'The store could not complete the purchase.');
  }
}

export async function restoreCommercePurchases(userId: string) {
  if (!await configureCommerce(userId)) throw new Error('Store purchases are not configured yet.');
  const customerInfo = await Purchases.restorePurchases();
  const restored = customerInfo.allPurchasedProductIdentifiers
    .map((identifier) => (Object.entries(PRODUCT_IDS).find(([, productId]) => productId === identifier)?.[0]) as ProductPlan | undefined)
    .filter((plan): plan is ProductPlan => Boolean(plan));
  const plan: ProductPlan | undefined = restored.includes('paid90') ? 'paid90' : restored.includes('paid30') ? 'paid30' : undefined;
  return plan ? { status: 'found' as const, plan } : { status: 'not-found' as const };
}
