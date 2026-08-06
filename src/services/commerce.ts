import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PRODUCT_CATEGORY, type PurchasesStoreProduct } from 'react-native-purchases';

export type ProductPlan = 'paid30' | 'paid90';
export type CommerceProduct = {
  plan: ProductPlan;
  identifier: string;
  title: string;
  description: string;
  localizedPrice: string;
  storeProduct: PurchasesStoreProduct;
};

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
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
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
    const purchaseError = error as { userCancelled?: boolean; code?: string; message?: string };
    if (purchaseError.userCancelled) return { status: 'cancelled' as const };
    if (purchaseError.code?.toLowerCase().includes('payment_pending')) return { status: 'pending' as const };
    throw new Error(purchaseError.message || 'The store could not complete the purchase.');
  }
}

export async function reconcilePurchases(userId: string) {
  if (!await configureCommerce(userId)) throw new Error('Store purchases are not configured yet.');
  await Purchases.syncPurchases();
  return { status: 'server-verifying' as const };
}
