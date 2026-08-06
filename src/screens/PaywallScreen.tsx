import { useEffect, useMemo, useState } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Check, ChevronRight, Lock, RotateCcw } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { Button, TextButton } from '@/components/Buttons';
import { Screen, Stagger } from '@/components/Screen';
import { Sparkle } from '@/components/Sparkle';
import { Toast, type ToastMessage } from '@/components/Toast';
import { completedStickerAssets } from '@/data/keepsakeAssets';
import { formatVoiceTime } from '@/domain/stats';
import { loadCommerceProducts, purchaseCommerceProduct, reconcilePurchases, type CommerceProduct, type ProductPlan } from '@/services/commerce';
import { colors, gradients, motion, nativeAnimationDriver, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const plans = [
  {
    id: 'paid30' as const,
    nights: 30,
    headline: 'Thirty nights',
    reports: 'One full reflection at night 30',
    aside: 'The month, finished',
  },
  {
    id: 'paid90' as const,
    nights: 90,
    headline: 'Ninety nights',
    reports: 'Reflections at nights 30, 60 and 90',
    aside: 'Long enough to watch something change',
  },
];

const includes = [
  'One question each eligible night',
  'Private one-take recordings',
  'Evidence-grounded reflections drawn from your own voice',
  'Post-reveal access to your backed-up recordings',
];

/**
 * What actually happens after the button — Blinkist's fix, adapted.
 *
 * Their users complained about free trials because they could not see the
 * shape of the commitment; a step-by-step timeline of what happens and when
 * raised sign-ups and cut complaints at the same time. The same anxiety exists
 * here for the opposite reason: people have been trained to assume every
 * purchase renews. Saying "nothing renews" once in body copy is weaker than
 * drawing the end of the line.
 */
const timeline = [
  { label: 'Today', body: 'One payment. The rest of the chapter unlocks straight away.' },
  { label: 'Tonight', body: 'Your question arrives at your usual hour, as it always has.' },
  { label: 'At the end', body: 'Your reflection is written from your own recordings, and the chapter closes.' },
  { label: 'After that', body: 'Nothing renews. Nothing is charged again unless you choose another chapter.' },
];

/** Shimmering placeholder while store prices resolve — the tiers used to show
 *  a bare em dash, which reads as broken rather than loading. */
function PriceSkeleton() {
  const shimmer = useState(() => new Animated.Value(0))[0];
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 900, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
      Animated.timing(shimmer, { toValue: 0, duration: 900, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
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

/**
 * Step one: what has already been made.
 *
 * Opal spends the screens before its paywall selling the outcome rather than
 * the product, and moved trial starts from 7% to 17% doing it. The equivalent
 * here is not a promise — it is a receipt. By the time anyone sees this screen
 * they have recorded real nights, and their own minutes of voice is the most
 * persuasive number the app will ever have.
 */
function ValueStep({ nightsKept, voiceSeconds, targetLength, onContinue, onLater }: {
  nightsKept: number;
  voiceSeconds: number;
  targetLength: number;
  onContinue: () => void;
  onLater: () => void;
}) {
  return (
    <>
      <Stagger index={0}>
        <Text style={styles.aside}>The thread only shows up over time.</Text>
        <Text accessibilityRole="header" style={styles.title}>You have {nightsKept} {nightsKept === 1 ? 'night' : 'nights'} of your own voice.</Text>
        <Text style={styles.body}>
          That is {formatVoiceTime(voiceSeconds)} that did not exist a week ago. A reflection needs more than
          {' '}{targetLength} nights before it can tell you anything you do not already know.
        </Text>
      </Stagger>

      <Stagger index={1}>
        <View style={styles.receipt}>
          <LinearGradient colors={gradients.cardSheen} style={styles.receiptSheen} pointerEvents="none" />
          <View style={styles.stickerStrip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[0, 1, 2, 3, 4].map((index) => (
              <Image
                key={index}
                source={completedStickerAssets[index]}
                resizeMode="contain"
                style={[styles.stripSticker, { transform: [{ rotate: `${(index - 2) * 3}deg` }] }]}
              />
            ))}
            <Sparkle size={13} color={colors.brass} twinkle style={styles.stripSparkle} />
          </View>

          <View style={styles.receiptRow}>
            <View style={styles.receiptStat}>
              <Text style={styles.receiptValue}>{formatVoiceTime(voiceSeconds)}</Text>
              <Text style={styles.receiptLabel}>kept so far</Text>
            </View>
            <View style={styles.receiptDivider} />
            <View style={styles.receiptStat}>
              <Text style={styles.receiptValue}>{nightsKept}</Text>
              <Text style={styles.receiptLabel}>{nightsKept === 1 ? 'night sealed' : 'nights sealed'}</Text>
            </View>
          </View>
        </View>
      </Stagger>

      <Stagger index={2}>
        <Text style={styles.sectionLabel}>What the next chapter adds</Text>
        <View style={styles.includes}>
          {includes.map((item) => (
            <View key={item} style={styles.includeRow}>
              <View style={styles.tick}><Check size={12} strokeWidth={3} color={colors.roseText} /></View>
              <Text style={styles.include}>{item}</Text>
            </View>
          ))}
        </View>
      </Stagger>

      <Stagger index={3} style={styles.footer}>
        <Button icon={ArrowRight} onPress={onContinue}>See the chapters</Button>
        <TextButton onPress={onLater}>Not yet</TextButton>
      </Stagger>
    </>
  );
}

export function PaywallScreen({
  authState, ownerId, nightsKept, voiceSeconds, targetLength, onBack, onAuth, onVerifying, onUnavailable, onPrivacy, onTerms,
}: {
  authState: 'local' | 'anonymous' | 'authenticated';
  ownerId?: string;
  nightsKept: number;
  voiceSeconds: number;
  targetLength: number;
  onBack: () => void;
  onAuth: () => void;
  onVerifying: (tier: ProductPlan) => Promise<void>;
  onUnavailable: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
}) {
  // Jonathan Wu's finding, and the one that surprised me most: multi-page
  // paywalls almost always beat single-page ones. The price is not the first
  // thing asked for — it is the second, after the value has landed.
  const [step, setStep] = useState<'value' | 'plans'>('value');
  const [selected, setSelected] = useState<ProductPlan>('paid30');
  const [products, setProducts] = useState<CommerceProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [working, setWorking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [toast, setToast] = useState<ToastMessage>(null);
  const selectedProduct = useMemo(() => products.find((product) => product.plan === selected), [products, selected]);

  // No account required to read a price. Both stores expect the real localized
  // price to be legible on the screen that asks for money, and a first-time
  // reader is exactly who needs to see it.
  useEffect(() => {
    setLoadingProducts(true);
    loadCommerceProducts(authState === 'authenticated' ? ownerId : undefined)
      .then(setProducts)
      .catch((error: unknown) => setToast({
        text: error instanceof Error ? error.message : 'Store products are unavailable.',
        tone: 'error',
      }))
      .finally(() => setLoadingProducts(false));
  }, [authState, ownerId]);

  const buy = async () => {
    // The purchase itself still needs an owner: access is granted by the server
    // ledger after verification, never by the client.
    if (authState !== 'authenticated' || !ownerId) return onAuth();
    if (!selectedProduct) {
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

  // Leaving from the plans is the one moment worth a second word. Not a
  // discount and not a countdown — Jonathan's advice is that a fake wheel or a
  // manufactured deadline wins the week and loses the business, and Apple has
  // started rejecting the patterns that mislead. The honest exit offer is the
  // smaller chapter.
  const leave = () => {
    if (step === 'plans' && selected === 'paid90') {
      setLeaving(true);
      return;
    }
    onBack();
  };

  return (
    <>
      <Screen header={<AppHeader onBack={step === 'plans' ? () => setStep('value') : onBack} />}>
        {step === 'value' ? (
          <ValueStep
            nightsKept={nightsKept}
            voiceSeconds={voiceSeconds}
            targetLength={targetLength}
            onContinue={() => setStep('plans')}
            onLater={onBack}
          />
        ) : (
          <>
            <Stagger index={0}>
              <Text style={styles.aside}>Choose how long the story runs.</Text>
              <Text accessibilityRole="header" style={styles.title}>Keep listening.</Text>
              {/* The reassurance line. Jonathan's "no commitment, cancel
                  anytime" subtitle reliably lifts conversion; the honest
                  version of it here is that there is nothing to cancel. */}
              <View style={styles.reassure}>
                <Lock size={13} strokeWidth={2} color={colors.mossText} />
                <Text style={styles.reassureText}>One payment. Nothing renews, ever.</Text>
              </View>
            </Stagger>

            <Stagger index={1}>
              <View accessibilityRole="radiogroup" style={styles.tiers}>
                {plans.map((plan) => {
                  const active = plan.id === selected;
                  const product = products.find((item) => item.plan === plan.id);
                  const priceLabel = product?.localizedPrice
                    ?? (loadingProducts ? 'Price loading' : 'Price unavailable');
                  return (
                    <Pressable
                      key={plan.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      accessibilityLabel={`${plan.headline}. ${plan.nights} nights. ${plan.reports}. ${priceLabel}. One payment, nothing renews.`}
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
                          <Text numberOfLines={1} style={[styles.price, !product && styles.priceUnavailable]}>{priceLabel}</Text>
                        )}
                      </View>

                      <Text style={styles.tierAside}>{plan.aside}</Text>
                      <Text style={styles.report}>{plan.reports}</Text>
                      {/* Price anchoring, the way Tide breaks a subscription into
                          weeks: the same money, stated at the scale the product
                          is actually lived at. Derived from the real store price
                          so it can never contradict what the store charges. */}
                      {product ? (
                        <Text style={styles.perNight}>
                          {perNight(product, plan.nights) ?? product.title}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </Stagger>

            <Stagger index={2}>
              <Text style={styles.sectionLabel}>What happens next</Text>
              <View style={styles.timeline}>
                {timeline.map((entry, index) => (
                  <View key={entry.label} style={styles.timelineRow}>
                    <View style={styles.timelineRail}>
                      <View style={[styles.timelineDot, index === timeline.length - 1 && styles.timelineDotEnd]} />
                      {index < timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
                    </View>
                    <View style={styles.timelineCopy}>
                      <Text style={styles.timelineLabel}>{entry.label}</Text>
                      <Text style={styles.timelineBody}>{entry.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Stagger>

            <Stagger index={3}>
              <View style={styles.footer}>
                <Button
                  loading={working}
                  right={<ChevronRight size={18} strokeWidth={2.4} color={colors.white} />}
                  onPress={() => void buy()}
                >
                  {selectedProduct
                    ? `Continue for ${selectedProduct.localizedPrice}`
                    : loadingProducts ? 'Loading prices' : 'Retry store products'}
                </Button>
                {/* Required by App Store Review Guideline 3.1.1: restorable
                    purchases must have a restore mechanism in the app. */}
                <Button icon={RotateCcw} variant="outline" disabled={working} onPress={() => void restore()}>
                  Restore purchases
                </Button>

                {/* Guideline 5.1.1(i) asks for the privacy policy inside the app
                    in an easily accessible manner, and App Review expects a
                    functional Terms of Use link in the binary. Both live in
                    Settings too; a reviewer looking at the purchase screen
                    should not have to go and find them. */}
                <View style={styles.legalRow}>
                  <TextButton onPress={onTerms}>Terms of Use</TextButton>
                  <Text style={styles.legalDot}>·</Text>
                  <TextButton onPress={onPrivacy}>Privacy Policy</TextButton>
                </View>
                <Text style={styles.legalNote}>
                  Charged once through your {storeName()} account at the price shown. This is not a subscription and does not
                  renew. Purchases restore on any device signed in to the same account.
                </Text>

                <TextButton onPress={leave}>Not yet</TextButton>
              </View>
            </Stagger>
          </>
        )}
      </Screen>

      {/* The exit-intent sheet: a smaller commitment, never a manufactured one. */}
      <BottomSheet
        visible={leaving}
        title="Not ready for ninety?"
        body="Thirty nights is the same ritual and the same reflection, for less. Your seven nights stay yours either way — nothing you have already recorded is affected."
        actions={[
          {
            label: 'Show me thirty',
            onPress: () => { setSelected('paid30'); setLeaving(false); },
          },
          { label: 'Leave for now', variant: 'outline', onPress: () => { setLeaving(false); onBack(); } },
        ]}
        onClose={() => setLeaving(false)}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

/** Named honestly per platform: the charge really is made by whichever store
 *  the app was installed from, and saying so is what both review teams want. */
function storeName() {
  return Platform.OS === 'ios' ? 'App Store' : 'Google Play';
}

/**
 * The store price divided across the nights it buys, in the store's own
 * currency and format. Returns undefined rather than guessing when the price
 * string cannot be parsed — an invented number next to a real one is the one
 * thing this line must never do.
 */
function perNight(product: CommerceProduct, nights: number) {
  const raw = product.storeProduct.price;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined;
  const each = raw / nights;
  try {
    const formatted = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: product.storeProduct.currencyCode,
      minimumFractionDigits: 2,
    }).format(each);
    return `About ${formatted} a night`;
  } catch {
    return undefined;
  }
}

const styles = StyleSheet.create({
  aside: { color: colors.paperDim, fontFamily: typography.serifItalic, fontSize: 16 },
  title: { ...textStyles.title, marginTop: 14 },
  body: { ...textStyles.bodySmall, fontSize: 16, lineHeight: 25, marginTop: 12 },
  sectionLabel: {
    color: colors.paperDim,
    fontFamily: typography.serifItalic,
    fontSize: 17,
    marginTop: 32,
    marginBottom: 14,
  },

  reassure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: surfaces.success,
    borderWidth: 1,
    borderColor: 'rgba(90,116,98,0.26)',
  },
  reassureText: {
    color: colors.mossText,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 13,
  },

  receipt: {
    marginTop: 26,
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(184,134,53,0.22)',
    backgroundColor: surfaces.card,
    overflow: 'hidden',
    ...shadows.floating,
    shadowOpacity: 0.12,
  },
  receiptSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 76 },
  receiptRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  receiptStat: { flex: 1, alignItems: 'center' },
  receiptDivider: { width: 1, height: 34, backgroundColor: colors.line },
  receiptValue: { color: colors.bone, fontFamily: typography.serifSemiBold, fontSize: 26 },
  receiptLabel: { ...textStyles.caption, marginTop: 4 },

  stickerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  stripSticker: { width: 54, height: 54 },
  stripSparkle: { marginLeft: 6 },

  tiers: { gap: 12, marginTop: 26 },
  tier: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 18,
    paddingTop: 20,
    backgroundColor: surfaces.card,
    overflow: 'hidden',
    ...shadows.soft,
    shadowOpacity: 0.06,
  },
  activeTier: {
    borderColor: colors.roseDeep,
    backgroundColor: surfaces.selected,
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
  // Price stays large and high-contrast: App Review rejects paywalls where the
  // price is present but not prominent and legible.
  price: {
    flexShrink: 1,
    color: colors.bone,
    fontFamily: typography.serifSemiBold,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  priceUnavailable: {
    color: colors.boneDim,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 13,
    letterSpacing: 0,
  },
  skeleton: {
    width: 72,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.blush,
  },
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
  tierAside: {
    color: colors.paperDim,
    fontFamily: typography.serifItalic,
    fontSize: 15,
    marginTop: 10,
    marginLeft: 32,
  },
  report: {
    ...textStyles.bodySmall,
    fontSize: 14,
    marginTop: 4,
    marginLeft: 32,
  },
  perNight: {
    color: colors.brassText,
    fontFamily: typography.mono,
    fontSize: 11.5,
    letterSpacing: 0.3,
    marginTop: 10,
    marginLeft: 32,
  },

  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', gap: 14 },
  timelineRail: { width: 10, alignItems: 'center' },
  timelineDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginTop: 5,
    backgroundColor: colors.rose,
  },
  timelineDotEnd: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.brass,
  },
  timelineLine: { flex: 1, width: 1, marginVertical: 4, backgroundColor: colors.line },
  timelineCopy: { flex: 1, paddingBottom: 18 },
  timelineLabel: {
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 16,
    lineHeight: 21,
  },
  timelineBody: { ...textStyles.bodySmall, fontSize: 14, lineHeight: 21, marginTop: 3 },

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

  footer: { alignItems: 'center', gap: 10, marginTop: 30 },
  legalRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  legalDot: { color: colors.boneFaint, fontFamily: typography.sans, fontSize: 13 },
  legalNote: {
    ...textStyles.caption,
    color: colors.boneFaint,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    maxWidth: 320,
  },
});
