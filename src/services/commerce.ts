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

let configuredFor: string | null = null;

function apiKey() {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  return undefined;
}

export function isCommerceConfigured() {
  const key = apiKey();
  return Boolean(key && !key.includes('replace_me') && Platform.OS !== 'web');
}

export async function configureCommerce(userId: string) {
  if (!isCommerceConfigured()) return false;
  if (configuredFor === userId) return true;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  if (!configuredFor) Purchases.configure({ apiKey: apiKey()!, appUserID: userId });
  else await Purchases.logIn(userId);
  configuredFor = userId;
  return true;
}

export async function loadCommerceProducts(userId: string) {
  if (!await configureCommerce(userId)) return [];
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
