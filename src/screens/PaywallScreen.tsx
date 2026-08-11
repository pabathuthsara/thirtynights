import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronDown, ChevronUp, Lock, RotateCcw, ShieldCheck } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button, TextButton } from '@/components/Buttons';
import { Screen, Stagger } from '@/components/Screen';
import { Sparkle } from '@/components/Sparkle';
import { Toast, type ToastMessage } from '@/components/Toast';
import { entitlementCovers } from '@/domain/conversion';
import {
  canClearVerificationAfterRestoreNotFound,
  createPurchaseIntent,
  isAbandonablePreStoreVerification,
  isAuthoritativePurchaseVerification,
  isPurchaseIntentResumable,
  loadCommerceProducts,
  purchaseCommerceProduct,
  restoreCommercePurchases,
  type CommerceProduct,
} from '@/services/commerce';
import { trackAnalyticsEvent, type StoreName as AnalyticsStoreName } from '@/services/analytics';
import { colors, gradients, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import type {
  AccessTier,
  AuthState,
  PaywallSource,
  ProductPlan,
  PurchaseIntent,
  PurchaseVerification,
  RestoreResult,
} from '@/types';

const included = [
  'Nights 8–30 in this same chapter',
  'Your full night-30 reflection',
  'Private one-take recordings and playable evidence',
  'Exportable recordings, dates, and reflections',
] as const;

function storeName() {
  return Platform.OS === 'ios' ? 'App Store' : 'Google Play';
}

function storeKey(): RestoreResult['store'] {
  return Platform.OS === 'ios' ? 'app-store' : 'google-play';
}

function analyticsStoreName(): AnalyticsStoreName {
  return Platform.OS === 'ios' ? 'app_store' : 'google_play';
}

function offerCopy(plan: ProductPlan) {
  return plan === 'paid90'
    ? { title: 'Ninety nights', detail: 'Includes reflections at nights 30, 60, and 90' }
    : { title: 'Thirty Nights', detail: 'Unlock nights 8–30 and your full night-30 reflection' };
}

export function PaywallScreen({
  accessTier,
  authState,
  ownerId,
  nightsKept,
  source,
  intent,
  verification,
  restoreResult,
  onBack,
  onAuth,
  onIntent,
  onVerification,
  onRefreshEntitlement,
  onVerifying,
  onRestoreResult,
  onUnavailable,
  onPrivacy,
  onTerms,
}: {
  accessTier: AccessTier;
  authState: AuthState;
  ownerId?: string;
  nightsKept: number;
  source: PaywallSource;
  intent?: PurchaseIntent;
  verification?: PurchaseVerification;
  restoreResult?: RestoreResult;
  onBack: () => void;
  onAuth: () => void;
  onIntent: (intent?: PurchaseIntent) => void;
  onVerification: (verification?: PurchaseVerification) => void;
  onRefreshEntitlement: () => Promise<AccessTier | undefined>;
  onVerifying: (tier: ProductPlan) => Promise<'granted' | 'pending'>;
  onRestoreResult: (result: RestoreResult) => void;
  onUnavailable: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < 380 || fontScale > 1.3;
  const [selected, setSelected] = useState<ProductPlan>(intent?.plan ?? (accessTier === 'trial' ? 'paid30' : 'paid90'));
  const [showComparison, setShowComparison] = useState(intent?.plan === 'paid90' || accessTier !== 'trial');
  const [products, setProducts] = useState<CommerceProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<ToastMessage>(null);
  const resumed = useRef<string | undefined>(undefined);
  const viewTracked = useRef(false);
  const selectedProduct = useMemo(() => products.find((product) => product.plan === selected), [products, selected]);
  const selectedCovered = entitlementCovers(accessTier, selected);
  const thirtyProduct = products.find((product) => product.plan === 'paid30');
  const ninetyProduct = products.find((product) => product.plan === 'paid90');

  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    trackAnalyticsEvent('paywall_viewed', { source, variant: 'direct_30' });
  }, [source]);

  useEffect(() => {
    setLoadingProducts(true);
    loadCommerceProducts(authState === 'authenticated' ? ownerId : undefined)
      .then(setProducts)
      .catch((error: unknown) => setToast({
        text: error instanceof Error ? error.message : 'Store prices are unavailable right now.',
        tone: 'error',
      }))
      .finally(() => setLoadingProducts(false));
  }, [authState, ownerId]);

  const beginIntent = useCallback((kind: PurchaseIntent['kind'], plan: ProductPlan, product?: CommerceProduct) => {
    try {
      onIntent(createPurchaseIntent({
        kind,
        plan,
        productId: product?.identifier,
        source,
        localizedPrice: product?.localizedPrice,
      }));
      onAuth();
    } catch {
      onUnavailable();
    }
  }, [onAuth, onIntent, onUnavailable, source]);

  const buy = useCallback(async (plan: ProductPlan = selected, requiredProductId?: string) => {
    if (entitlementCovers(accessTier, plan)) {
      onIntent(undefined);
      onVerification(undefined);
      setToast({ text: 'These nights are already unlocked for this account.', tone: 'success' });
      return;
    }
    if (verification) return;
    const product = requiredProductId
      ? products.find((candidate) => candidate.plan === plan && candidate.identifier === requiredProductId)
      : products.find((candidate) => candidate.plan === plan);
    if (!product) {
      trackAnalyticsEvent('checkout_failed', { plan, source, stage: 'configuration' });
      onUnavailable();
      return;
    }
    if (authState !== 'authenticated' || !ownerId) {
      beginIntent('purchase', plan, product);
      return;
    }

    // Re-read the ledger immediately before opening the native purchase sheet.
    // A stale local trial must never sell a lower tier to an account that is
    // already covered on another device.
    setWorking(true);
    const authoritativeTier = await onRefreshEntitlement();
    if (!authoritativeTier) {
      trackAnalyticsEvent('checkout_failed', { plan, source, stage: 'server' });
      setToast({ text: 'Existing access could not be checked. Connect to the internet and try again before purchasing.', tone: 'error' });
      setWorking(false);
      return;
    }
    if (entitlementCovers(authoritativeTier, plan)) {
      onIntent(undefined);
      onVerification(undefined);
      setToast({ text: 'These nights are already unlocked for this account.', tone: 'success' });
      setWorking(false);
      return;
    }

    const base = {
      plan,
      source,
      localizedPrice: product.localizedPrice,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      setWorking(true);
      onIntent(undefined);
      onVerification({ ...base, status: 'store-confirming' });
      trackAnalyticsEvent('checkout_started', { plan, source });
      const result = await purchaseCommerceProduct(ownerId, product);
      if (result.status === 'cancelled') {
        trackAnalyticsEvent('checkout_cancelled', { plan, source });
        onVerification(undefined);
        setToast({ text: 'Purchase cancelled. Nothing was charged or unlocked.', tone: 'error' });
        return;
      }
      if (result.status === 'pending') {
        trackAnalyticsEvent('checkout_pending', { plan, source });
        onVerification({ ...base, status: 'pending-approval', updatedAt: new Date().toISOString() });
        setToast({ text: 'Purchase pending approval. You do not need to buy again.', tone: 'success' });
        return;
      }
      if (result.status === 'already-purchased') {
        // Never ask the store to charge again. Rehydrate the existing receipt
        // and let the authoritative entitlement ledger decide what it covers.
        trackAnalyticsEvent('restore_started', { store: analyticsStoreName() });
        const restoredPurchase = await restoreCommercePurchases(ownerId);
        if (restoredPurchase.status === 'not-found') {
          throw new Error(`This item is already owned, but ${storeName()} did not return a restorable Thirty Nights purchase. Contact support before trying again.`);
        }
        trackAnalyticsEvent('restore_found', { store: analyticsStoreName(), plan: restoredPurchase.plan });
        onRestoreResult({ status: 'found', store: storeKey(), checkedAt: new Date().toISOString() });
        onVerification({
          ...base,
          plan: restoredPurchase.plan,
          status: 'server-verifying',
          updatedAt: new Date().toISOString(),
        });
        const status = await onVerifying(restoredPurchase.plan);
        if (status === 'pending') {
          setToast({ text: 'Existing purchase found. The server is finishing access restoration.', tone: 'success' });
        }
        return;
      }

      trackAnalyticsEvent('checkout_store_success', { plan, source });
      onVerification({
        ...base,
        status: 'server-verifying',
        transactionReference: result.transaction.transactionIdentifier,
        storeConfirmedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const status = await onVerifying(plan);
      if (status === 'pending') {
        setToast({ text: 'Purchase received. Finishing setup in the background—you do not need to buy again.', tone: 'success' });
      }
    } catch (error) {
      trackAnalyticsEvent('checkout_failed', { plan, source, stage: 'store' });
      onVerification({ ...base, status: 'failed', updatedAt: new Date().toISOString() });
      setToast({
        text: error instanceof Error ? error.message : 'The store response could not be confirmed. Restore before trying again.',
        tone: 'error',
      });
    } finally {
      setWorking(false);
    }
  }, [accessTier, authState, beginIntent, onIntent, onRefreshEntitlement, onRestoreResult, onUnavailable, onVerification, onVerifying, ownerId, products, selected, source, verification]);

  const restore = useCallback(async () => {
    if (authState !== 'authenticated' || !ownerId) {
      beginIntent('restore', selected, selectedProduct);
      return;
    }
    try {
      setWorking(true);
      onIntent(undefined);
      trackAnalyticsEvent('restore_started', { store: analyticsStoreName() });
      const result = await restoreCommercePurchases(ownerId);
      if (result.status === 'not-found') {
        trackAnalyticsEvent('restore_not_found', { store: analyticsStoreName() });
        const restored: RestoreResult = { status: 'not-found', store: storeKey(), checkedAt: new Date().toISOString() };
        onRestoreResult(restored);
        if (canClearVerificationAfterRestoreNotFound(verification)) onVerification(undefined);
        setToast({ text: `No Thirty Nights purchase was found for this ${storeName()} account.`, tone: 'error' });
        return;
      }

      const restored: RestoreResult = { status: 'found', store: storeKey(), checkedAt: new Date().toISOString() };
      trackAnalyticsEvent('restore_found', { store: analyticsStoreName(), plan: result.plan });
      onRestoreResult(restored);
      onVerification({
        plan: result.plan,
        source: 'settings_restore',
        status: 'server-verifying',
        updatedAt: new Date().toISOString(),
      });
      const status = await onVerifying(result.plan);
      if (status === 'pending') {
        setToast({ text: 'Purchase found. The server is finishing access restoration.', tone: 'success' });
      }
    } catch (error) {
      trackAnalyticsEvent('restore_failed', { store: analyticsStoreName() });
      onRestoreResult({ status: 'failed', store: storeKey(), checkedAt: new Date().toISOString() });
      setToast({ text: error instanceof Error ? error.message : 'Purchase history could not be restored.', tone: 'error' });
    } finally {
      setWorking(false);
    }
  }, [authState, beginIntent, onIntent, onRestoreResult, onVerification, onVerifying, ownerId, selected, selectedProduct, verification]);

  // Authentication remounts this screen. A durable intent brings the person
  // straight back to the exact store action they chose, with no repeated pitch.
  useEffect(() => {
    if (!intent || authState !== 'authenticated' || !ownerId || loadingProducts || resumed.current === intent.resumeToken) return;
    resumed.current = intent.resumeToken;
    setSelected(intent.plan);
    if (intent.plan === 'paid90') setShowComparison(true);
    if (!isPurchaseIntentResumable(intent) || intent.source !== source) {
      onIntent(undefined);
      setToast({ text: 'That checkout continuation expired. Review the current offer before trying again.', tone: 'error' });
      return;
    }
    if (intent.kind === 'restore') {
      void restore();
      return;
    }
    const exactProduct = products.find((product) => product.plan === intent.plan && product.identifier === intent.productId);
    if (!exactProduct) {
      onIntent(undefined);
      onUnavailable();
      return;
    }
    if (!intent.localizedPrice || exactProduct.localizedPrice !== intent.localizedPrice) {
      onIntent(undefined);
      setToast({ text: 'The store price changed. Review the current price, then confirm again.', tone: 'error' });
      return;
    }
    void buy(intent.plan, intent.productId);
  }, [authState, buy, intent, loadingProducts, onIntent, onUnavailable, ownerId, products, restore, source]);

  const dismiss = useCallback(() => {
    onIntent(undefined);
    onBack();
  }, [onBack, onIntent]);

  const abandonPreStoreAttempt = () => {
    if (!isAbandonablePreStoreVerification(verification)) return;
    onVerification(undefined);
    onIntent(undefined);
    setToast({ text: 'Interrupted checkout cleared. Nothing was unlocked; you can start again when ready.', tone: 'success' });
  };

  const checkPending = async () => {
    if (!verification) return;
    setWorking(true);
    try {
      const status = await onVerifying(verification.plan);
      if (status === 'pending') setToast({ text: 'Still finishing. You do not need to purchase again.', tone: 'success' });
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <Screen header={<AppHeader label="ONE-TIME UNLOCK" onBack={dismiss} />} contentStyle={styles.screen}>
        <Stagger index={0}>
          <Text style={styles.aside}>{nightsKept >= 7 ? '7 of 30 nights reached' : `${nightsKept} of 30 nights kept`}</Text>
          <Text accessibilityRole="header" style={styles.title}>Continue your chapter.</Text>
          <Text style={styles.body}>
            Unlock nights 8–30 and your full night-30 reflection. Your first seven nights stay exactly where they are.
          </Text>
          <View style={styles.reassure}>
            <Lock size={13} strokeWidth={2} color={colors.mossText} />
            <Text style={styles.reassureText}>One payment · no subscription · nothing renews</Text>
          </View>
        </Stagger>

        <Stagger index={1}>
          <OfferCard
            plan="paid30"
            product={thirtyProduct}
            loading={loadingProducts}
            active={selected === 'paid30'}
            covered={entitlementCovers(accessTier, 'paid30')}
            dominant
            narrow={narrow}
            onPress={() => {
              setSelected('paid30');
              trackAnalyticsEvent('plan_selected', { plan: 'paid30', source });
            }}
          />
        </Stagger>

        <Stagger index={2}>
          <View style={styles.includes}>
            {included.map((item) => (
              <View key={item} style={styles.includeRow}>
                <View style={styles.tick}><Check size={12} strokeWidth={3} color={colors.roseText} /></View>
                <Text style={styles.include}>{item}</Text>
              </View>
            ))}
          </View>
        </Stagger>

        {verification ? (
          <Stagger index={3}>
            <View accessibilityLiveRegion="polite" style={styles.pendingCard}>
              <ShieldCheck size={21} strokeWidth={1.9} color={verification.status === 'failed' ? colors.ember : colors.mossText} />
              <View style={styles.pendingCopy}>
                <Text style={styles.pendingTitle}>{verificationTitle(verification.status)}</Text>
                <Text style={styles.pendingBody}>{verificationBody(verification.status)}</Text>
              </View>
            </View>
          </Stagger>
        ) : null}

        <Stagger index={4} style={styles.actions}>
          {verification?.status === 'failed' ? (
            <Button icon={RotateCcw} loading={working} onPress={() => void restore()}>Restore before trying again</Button>
          ) : isAbandonablePreStoreVerification(verification) ? (
            <>
              <Button icon={RotateCcw} loading={working} onPress={() => void restore()}>Check store purchase</Button>
              <TextButton onPress={abandonPreStoreAttempt}>Abandon interrupted checkout</TextButton>
            </>
          ) : isAuthoritativePurchaseVerification(verification) ? (
            <Button loading={working} onPress={() => void checkPending()}>Check purchase status</Button>
          ) : verification ? (
            <Button icon={RotateCcw} loading={working} onPress={() => void restore()}>Reconcile with store</Button>
          ) : selectedCovered ? (
            <Button disabled>Already unlocked</Button>
          ) : (
            <Button loading={working} disabled={loadingProducts || !selectedProduct} onPress={() => void buy()}>
              {selectedProduct ? `Unlock ${selected === 'paid90' ? '90 nights' : 'nights 8–30'} — ${selectedProduct.localizedPrice}` : loadingProducts ? 'Loading your price…' : 'Store price unavailable'}
            </Button>
          )}

          {!verification || isAuthoritativePurchaseVerification(verification) ? (
            <Button icon={RotateCcw} variant="outline" disabled={working} onPress={() => void restore()}>Restore purchase</Button>
          ) : null}
          {restoreResult ? (
            <Text style={[styles.restoreResult, restoreResult.status === 'failed' && styles.restoreResultError]}>
              {restoreResult.status === 'found'
                ? `Purchase found on this ${storeName()} account.`
                : restoreResult.status === 'not-found'
                  ? `No Thirty Nights purchase found on this ${storeName()} account.`
                  : `${storeName()} purchase history could not be checked.`}
            </Text>
          ) : null}

          {ninetyProduct ? (
            <>
              <TextButton onPress={() => setShowComparison((value) => {
                const next = !value;
                if (next) trackAnalyticsEvent('paywall_viewed', { source, variant: 'compare_plans' });
                return next;
              })}>
                {showComparison ? 'Hide 90-night option' : 'Compare 90-night option'}
              </TextButton>
              {showComparison ? (
                <View style={styles.compareWrap}>
                  <OfferCard
                    plan="paid90"
                    product={ninetyProduct}
                    loading={false}
                    active={selected === 'paid90'}
                    covered={entitlementCovers(accessTier, 'paid90')}
                    narrow={narrow}
                    onPress={() => {
                      setSelected('paid90');
                      trackAnalyticsEvent('plan_selected', { plan: 'paid90', source });
                    }}
                  />
                  <View style={styles.compareHint}>
                    {showComparison ? <ChevronUp size={14} color={colors.boneFaint} /> : <ChevronDown size={14} color={colors.boneFaint} />}
                    <Text style={styles.compareHintText}>The 30-night journey remains complete on its own.</Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          <View style={styles.legalRow}>
            <TextButton onPress={onTerms}>Terms of Use</TextButton>
            <Text style={styles.legalDot}>·</Text>
            <TextButton onPress={onPrivacy}>Privacy Policy</TextButton>
          </View>
          <Text style={styles.legalNote}>
            Charged once through your {storeName()} account at the localized price shown. This is not a subscription and does not renew.
          </Text>
          <TextButton onPress={dismiss}>Not now</TextButton>
        </Stagger>
      </Screen>
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function OfferCard({ plan, product, loading, active, covered, dominant = false, narrow, onPress }: {
  plan: ProductPlan;
  product?: CommerceProduct;
  loading: boolean;
  active: boolean;
  covered: boolean;
  dominant?: boolean;
  narrow: boolean;
  onPress: () => void;
}) {
  const copy = offerCopy(plan);
  const price = product?.localizedPrice ?? (loading ? 'Loading price…' : 'Unavailable');
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled: covered }}
      accessibilityLabel={`${copy.title}. ${copy.detail}. ${price}. One payment, nothing renews.`}
      disabled={covered}
      onPress={onPress}
      style={({ pressed }) => [styles.offer, dominant && styles.dominantOffer, active && styles.activeOffer, covered && styles.coveredOffer, pressed && styles.offerPressed]}
    >
      <LinearGradient colors={gradients.cardSheen} style={styles.offerSheen} pointerEvents="none" />
      {dominant ? (
        <View style={styles.bestFit}><Sparkle size={8} color={colors.white} /><Text style={styles.bestFitText}>THE THIRTY NIGHTS JOURNEY</Text></View>
      ) : null}
      <View style={[styles.offerTop, narrow && styles.offerTopNarrow]}>
        <View style={styles.offerHeading}>
          <View style={[styles.radio, active && styles.radioActive]}>{active ? <Check size={12} strokeWidth={3} color={colors.white} /> : null}</View>
          <Text style={styles.offerTitle}>{copy.title}</Text>
        </View>
        <Text style={[styles.price, narrow && styles.priceNarrow, !product && styles.priceUnavailable]}>{price}</Text>
      </View>
      <Text style={styles.offerDetail}>{copy.detail}</Text>
      <Text style={styles.once}>{covered ? 'ALREADY UNLOCKED FOR THIS ACCOUNT' : 'ONE PAYMENT · LIFETIME ACCESS TO THESE NIGHTS'}</Text>
    </Pressable>
  );
}

function verificationTitle(status: PurchaseVerification['status']) {
  if (status === 'store-confirming') return `Confirming with ${storeName()}…`;
  if (status === 'server-verifying') return 'Purchase received—finishing setup.';
  if (status === 'pending-approval') return 'Purchase pending approval.';
  return 'The store response needs review.';
}

function verificationBody(status: PurchaseVerification['status']) {
  if (status === 'store-confirming') return 'Store confirmation did not finish. Restore to check for a completed purchase, or abandon this interrupted attempt.';
  if (status === 'pending-approval') return 'This status survives closing the app. Access opens automatically after approval; do not purchase again.';
  if (status === 'failed') return 'Use Restore purchase to check your store account before starting another checkout.';
  return 'You can safely close the app. We will reconcile the authoritative grant when it arrives.';
}

const styles = StyleSheet.create({
  screen: { gap: 26, paddingBottom: 34 },
  aside: { color: colors.paperDim, fontFamily: typography.serifItalic, fontSize: 17 },
  title: { ...textStyles.title, marginTop: 10 },
  body: { ...textStyles.bodySmall, fontSize: 16, lineHeight: 25, marginTop: 12 },
  reassure: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: surfaces.success,
    borderWidth: 1,
    borderColor: 'rgba(90,116,98,0.26)',
  },
  reassureText: { flexShrink: 1, color: colors.mossText, fontFamily: typography.sans, fontWeight: weight.semibold, fontSize: 13 },
  offer: {
    padding: 18,
    paddingTop: 22,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: surfaces.card,
    overflow: 'hidden',
    ...shadows.soft,
  },
  dominantOffer: { paddingTop: 0 },
  activeOffer: { borderColor: colors.roseDeep, backgroundColor: surfaces.selected, ...shadows.floating, shadowColor: '#8A3547', shadowOpacity: 0.16 },
  coveredOffer: { opacity: 0.72 },
  offerPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  offerSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 72 },
  bestFit: {
    minHeight: 40,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: -18,
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.roseDeep,
  },
  bestFitText: { flexShrink: 1, color: colors.white, fontFamily: typography.monoMedium, fontSize: 9, lineHeight: 14, letterSpacing: 1.1, textAlign: 'center' },
  offerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  offerTopNarrow: { alignItems: 'flex-start', flexDirection: 'column', gap: 10 },
  offerHeading: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  radioActive: { backgroundColor: colors.roseDeep, borderColor: colors.roseDeep },
  offerTitle: { flexShrink: 1, color: colors.bone, fontFamily: typography.serifSemiBold, fontSize: 23, lineHeight: 29 },
  price: { flexShrink: 0, color: colors.bone, fontFamily: typography.serifSemiBold, fontSize: 25, lineHeight: 31, letterSpacing: -0.5, textAlign: 'right' },
  priceNarrow: { alignSelf: 'stretch', marginLeft: 32, minWidth: 0, flexShrink: 1, textAlign: 'left' },
  priceUnavailable: { color: colors.boneDim, fontFamily: typography.sans, fontWeight: weight.semibold, fontSize: 13, letterSpacing: 0 },
  offerDetail: { ...textStyles.bodySmall, fontSize: 14, lineHeight: 21, marginTop: 12, marginLeft: 32 },
  once: { color: colors.brassText, fontFamily: typography.monoMedium, fontSize: 9.5, lineHeight: 15, letterSpacing: 0.7, marginTop: 12, marginLeft: 32 },
  includes: { gap: 12 },
  includeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  tick: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239,188,195,0.34)', marginTop: 1 },
  include: { flex: 1, ...textStyles.bodySmall, fontSize: 15, color: colors.bone },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 17,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(90,116,98,0.24)',
    backgroundColor: surfaces.success,
  },
  pendingCopy: { flex: 1 },
  pendingTitle: { color: colors.bone, fontFamily: typography.serifMedium, fontSize: 17, lineHeight: 22 },
  pendingBody: { ...textStyles.caption, marginTop: 4, fontSize: 12.5, lineHeight: 19 },
  actions: { alignItems: 'center', gap: 10 },
  compareWrap: { width: '100%', gap: 8 },
  compareHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  compareHintText: { ...textStyles.caption, flexShrink: 1, textAlign: 'center' },
  legalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  legalDot: { color: colors.boneFaint, fontFamily: typography.sans, fontSize: 13 },
  legalNote: { ...textStyles.caption, color: colors.boneFaint, fontSize: 11.5, lineHeight: 17, textAlign: 'center', maxWidth: 340 },
  restoreResult: { ...textStyles.caption, color: colors.mossText, textAlign: 'center' },
  restoreResultError: { color: colors.ember },
});
