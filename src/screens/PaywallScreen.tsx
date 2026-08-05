import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, RotateCcw } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { Button, TextButton } from '@/components/Buttons';
import { Screen, Stagger } from '@/components/Screen';
import { Sparkle } from '@/components/Sparkle';
import { Toast, type ToastMessage } from '@/components/Toast';
import { loadCommerceProducts, purchaseCommerceProduct, reconcilePurchases, type CommerceProduct, type ProductPlan } from '@/services/commerce';
import { colors, gradients, motion, radii, shadows, textStyles, typography, weight } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const plans = [
  { id: 'paid30' as const, nights: 30, headline: 'Thirty nights', reports: 'One full reflection at night 30' },
  { id: 'paid90' as const, nights: 90, headline: 'Ninety nights', reports: 'Reflections at nights 30, 60 and 90' },
];

const includes = [
  'One question each eligible night',
  'Private one-take recordings',
  'Evidence-grounded reflections drawn from your own voice',
  'Post-reveal access to your backed-up recordings',
];

/** Shimmering placeholder while store prices resolve — the tiers used to show
 *  a bare em dash, which reads as broken rather than loading. */
function PriceSkeleton() {
  const shimmer = useState(() => new Animated.Value(0))[0];
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 900, easing: motion.easeInOut, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0, duration: 900, easing: motion.easeInOut, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, shimmer]);

  return (
    <Animated.View
      accessibilityLabel="Loading price"
      style={[styles.skeleton, { opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] }) }]}
    />
  );
}

export function PaywallScreen({ authState, ownerId, onBack, onAuth, onVerifying, onUnavailable }: {
  authState: 'local' | 'anonymous' | 'authenticated';
  ownerId?: string;
  onBack: () => void;
  onAuth: () => void;
  onVerifying: (tier: ProductPlan) => Promise<void>;
  onUnavailable: () => void;
}) {
  const [selected, setSelected] = useState<ProductPlan>('paid30');
  const [products, setProducts] = useState<CommerceProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<ToastMessage>(null);
  const [sheet, setSheet] = useState(false);
  const selectedProduct = useMemo(() => products.find((product) => product.plan === selected), [products, selected]);

  useEffect(() => {
    if (!ownerId || authState !== 'authenticated') return;
    setLoadingProducts(true);
    loadCommerceProducts(ownerId)
      .then(setProducts)
      .catch((error: unknown) => setToast({
        text: error instanceof Error ? error.message : 'Store products are unavailable.',
        tone: 'error',
      }))
      .finally(() => setLoadingProducts(false));
  }, [authState, ownerId]);

  const buy = async () => {
    if (authState !== 'authenticated' || !ownerId) return onAuth();
    if (!selectedProduct) {
      setSheet(true);
      onUnavailable();
      return;
    }
    try {
      setWorking(true);
      const result = await purchaseCommerceProduct(ownerId, selectedProduct);
      if (result.status === 'cancelled') {
        setToast({ text: 'Purchase cancelled. Nothing was charged or unlocked.', tone: 'error' });
      } else if (result.status === 'pending') {
        setToast({ text: 'The store marked this pending. Access opens only after server verification.', tone: 'error' });
      } else {
        setToast({ text: 'Purchase received. Verifying the server grant…', tone: 'success' });
        await onVerifying(selected);
      }
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : 'The purchase could not be completed.', tone: 'error' });
    } finally {
      setWorking(false);
    }
  };

  const restore = async () => {
    if (!ownerId || authState !== 'authenticated') return onAuth();
    try {
      setWorking(true);
      await reconcilePurchases(ownerId);
      setToast({ text: 'Store history synchronized. Checking your purchase ledger…', tone: 'success' });
      await onVerifying(selected);
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : 'Purchase history could not be synchronized.', tone: 'error' });
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <Screen header={<AppHeader onBack={onBack} />}>
        <Stagger index={0}>
          <Text style={textStyles.eyebrow}>THE THREAD ONLY SHOWS UP OVER TIME</Text>
          <Text accessibilityRole="header" style={styles.title}>Keep listening.</Text>
          <Text style={styles.body}>
            The first seven nights are included. One payment extends this same chapter — there is no subscription.
          </Text>
        </Stagger>

        <Stagger index={1}>
          <View accessibilityRole="radiogroup" style={styles.tiers}>
            {plans.map((plan) => {
              const active = plan.id === selected;
              const product = products.find((item) => item.plan === plan.id);
              return (
                <Pressable
                  key={plan.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={`${plan.headline}. ${plan.reports}. ${product?.localizedPrice ?? 'Price loading'}`}
                  onPress={() => setSelected(plan.id)}
                  style={({ pressed }) => [styles.tier, active && styles.activeTier, pressed && styles.tierPressed]}
                >
                  {active ? <LinearGradient colors={gradients.cardSheen} style={styles.tierSheen} pointerEvents="none" /> : null}
                  {plan.id === 'paid90' ? (
                    <View style={styles.badge}>
                      <Sparkle size={9} color={colors.white} />
                      <Text style={styles.badgeLabel}>THE FULL ARC</Text>
                    </View>
                  ) : null}

                  <View style={styles.tierTop}>
                    <View style={styles.tierHeading}>
                      <View style={[styles.radio, active && styles.radioActive]}>
                        {active ? <Check size={12} strokeWidth={3} color={colors.white} /> : null}
                      </View>
                      <Text style={styles.nights}>{plan.headline}</Text>
                    </View>
                    {loadingProducts && !product ? <PriceSkeleton /> : (
                      <Text numberOfLines={1} style={styles.price}>{product?.localizedPrice ?? '—'}</Text>
                    )}
                  </View>

                  <Text style={styles.report}>{plan.reports}</Text>
                  {product ? <Text numberOfLines={2} style={styles.product}>{product.title}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Stagger>

        <Stagger index={2}>
          <Text style={styles.sectionLabel}>EACH CHAPTER INCLUDES</Text>
          <View style={styles.includes}>
            {includes.map((item) => (
              <View key={item} style={styles.includeRow}>
                <View style={styles.tick}><Check size={12} strokeWidth={3} color={colors.roseText} /></View>
                <Text style={styles.include}>{item}</Text>
              </View>
            ))}
          </View>
        </Stagger>

        <Stagger index={3}>
          <View style={styles.footer}>
            <Button loading={working} onPress={() => void buy()}>
              {selectedProduct
                ? `Continue — ${selectedProduct.localizedPrice}`
                : authState === 'authenticated' ? 'Retry store products' : 'Connect an account to continue'}
            </Button>
            <Button icon={RotateCcw} variant="outline" disabled={working} onPress={() => void restore()}>
              Restore purchases
            </Button>
            <TextButton onPress={onBack}>Not yet</TextButton>
          </View>
        </Stagger>

        <BottomSheet
          visible={sheet}
          title="Store setup is not complete."
          body="The app will not use fake prices or unlock paid access locally. The account owner must activate matching Apple and Google products and supply the RevenueCat public keys."
          actions={[{ label: 'Close', variant: 'outline', onPress: () => setSheet(false) }]}
          onClose={() => setSheet(false)}
        />
      </Screen>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  title: { ...textStyles.title, marginTop: 14 },
  body: { ...textStyles.bodySmall, fontSize: 16, lineHeight: 25, marginTop: 12 },
  sectionLabel: { ...textStyles.eyebrow, fontSize: 11, marginTop: 32, marginBottom: 14 },

  tiers: { gap: 12, marginTop: 30 },
  tier: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 18,
    paddingTop: 20,
    backgroundColor: 'rgba(255,253,249,0.8)',
    overflow: 'hidden',
    ...shadows.soft,
    shadowOpacity: 0.06,
  },
  activeTier: {
    borderColor: colors.roseDeep,
    backgroundColor: 'rgba(250,235,237,0.9)',
    ...shadows.floating,
    shadowColor: '#8A3547',
    shadowOpacity: 0.16,
  },
  tierPressed: { opacity: 0.86 },
  tierSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 60 },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomLeftRadius: radii.md,
    backgroundColor: colors.brassText,
  },
  badgeLabel: {
    color: colors.white,
    fontFamily: typography.monoMedium,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  tierTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tierHeading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nights: {
    flexShrink: 1,
    color: colors.bone,
    fontFamily: typography.serifSemiBold,
    fontSize: 22,
  },
  price: {
    flexShrink: 1,
    color: colors.bone,
    fontFamily: typography.serifSemiBold,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  skeleton: {
    width: 72,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.blush,
  },
  // The radio now sits inline in the header row, so nothing can run underneath it.
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { backgroundColor: colors.roseDeep, borderColor: colors.roseDeep },
  report: {
    ...textStyles.bodySmall,
    fontSize: 14,
    marginTop: 10,
    marginLeft: 32,
  },
  product: {
    ...textStyles.caption,
    color: colors.boneFaint,
    fontFamily: typography.mono,
    fontSize: 11,
    marginTop: 10,
    marginLeft: 32,
  },

  includes: { gap: 12 },
  includeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,188,195,0.34)',
    marginTop: 1,
  },
  include: {
    flex: 1,
    ...textStyles.bodySmall,
    fontSize: 15,
    color: colors.bone,
  },
  footer: { alignItems: 'center', gap: 10, marginTop: 34 },
});
