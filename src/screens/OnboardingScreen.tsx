import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  AccessibilityInfo,
  Image,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ArrowRight, ShieldCheck } from 'lucide-react-native';

import { Button, TextButton } from '@/components/Buttons';
import { Screen } from '@/components/Screen';
import { Glow, Sparkle } from '@/components/Sparkle';
import { colors, motion, nativeAnimationDriver, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { completedStickerAssets, embossedStickerAssets, keepsakeDecorations, stickerAssetForNight } from '@/data/keepsakeAssets';
import { trackAnalyticsEvent } from '@/services/analytics';

const slides = [
  {
    eyebrow: 'Your first seven',
    title: 'One honest answer a night.',
    body: 'Speak once. Seal it. Hear what time reveals.',
    visual: 'seven',
  },
  {
    eyebrow: 'How the full journey works',
    title: 'Seven nights reveal the first thread.',
    body: 'Start with seven. Continue only if it feels worthwhile.',
    visual: 'journey',
  },
] as const;

type Visual = (typeof slides)[number]['visual'];

function SlideVisual({ kind, reducedMotion, compact }: { kind: Visual; reducedMotion: boolean; compact: boolean }) {
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 2800, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
      Animated.timing(float, { toValue: 0, duration: 2800, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [float, reducedMotion]);

  const drift = {
    transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, compact ? -5 : -9] }) }],
  };

  if (kind === 'journey') {
    return (
      <Animated.View style={[styles.journeyCard, compact && styles.compactJourneyCard, drift]}>
        <Glow size={compact ? 190 : 240} color={colors.rose} opacity={0.2} style={styles.cardGlow} />
        <Image
          source={keepsakeDecorations.journal}
          resizeMode="contain"
          accessibilityElementsHidden
          style={styles.journeyJournal}
        />
        <View style={styles.journeyRail}>
          <View style={styles.journeyStop}>
            <View style={styles.journeyNumber}><Text maxFontSizeMultiplier={1.6} style={styles.journeyNumberText}>7</Text></View>
            <Text maxFontSizeMultiplier={1.6} style={styles.journeyLabel}>FIRST REFLECTION</Text>
          </View>
          <View style={styles.journeyLine}>
            <Sparkle size={11} color={colors.brass} style={styles.journeySparkle} />
          </View>
          <View style={styles.journeyStop}>
            <View style={[styles.journeyNumber, styles.journeyNumberFinal]}>
              <Text maxFontSizeMultiplier={1.6} style={[styles.journeyNumberText, styles.journeyNumberTextFinal]}>30</Text>
            </View>
            <Text maxFontSizeMultiplier={1.6} style={styles.journeyLabel}>FULL REFLECTION</Text>
          </View>
        </View>
        <Text maxFontSizeMultiplier={1.6} style={styles.journeyCaption}>ONE CHAPTER · YOUR OWN VOICE</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.stickerCard, compact && styles.compactStickerCard, drift]}>
      <Glow size={compact ? 185 : 230} color={colors.rose} opacity={0.24} style={styles.cardGlow} />
      <View style={[styles.miniGrid, compact && styles.compactMiniGrid]}>
        {Array.from({ length: 7 }, (_, index) => (
          <View key={index} style={[styles.miniCell, compact && styles.compactMiniCell]}>
            <Image
              source={stickerAssetForNight(index === 0 ? completedStickerAssets : embossedStickerAssets, index + 1)}
              resizeMode="contain"
              style={[styles.miniArt, index > 0 && styles.miniFuture]}
            />
          </View>
        ))}
      </View>
      <Text maxFontSizeMultiplier={1.6} style={styles.miniCaption}>YOUR FIRST SEVEN · INCLUDED</Text>
    </Animated.View>
  );
}

function JourneyTimeline() {
  const entries = [
    ['Tonight', 'Answer one question in your own voice.'],
    ['Night 7', 'Receive your first private reflection.'],
    ['After night 7', 'One payment opens nights 8–30.'],
  ] as const;

  return (
    <View style={styles.timeline}>
      {entries.map(([label, body], entryIndex) => (
        <View key={label} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <View style={[styles.timelineDot, entryIndex === entries.length - 1 && styles.timelineDotFinal]} />
            {entryIndex < entries.length - 1 ? <View style={styles.timelineLine} /> : null}
          </View>
          <View style={styles.timelineCopy}>
            <Text maxFontSizeMultiplier={2} style={styles.timelineLabel}>{label}</Text>
            <Text maxFontSizeMultiplier={2} style={styles.timelineBody}>{body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function OnboardingScreen({ onComplete, onPreview }: { onComplete: () => void; onPreview?: () => void }) {
  const [index, setIndex] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const { width, height, fontScale } = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(() => Math.min(width, 520));
  const compact = height < 700 || width < 360 || fontScale > 1.2;
  // At accessibility sizes the illustration becomes less useful than keeping
  // every sentence and action immediately reachable. The art is decorative;
  // the full value, privacy, and payment story remains in the scrollable copy.
  const prioritizeText = fontScale > 1.7;
  const last = index === slides.length - 1;

  useEffect(() => {
    trackAnalyticsEvent('onboarding_viewed', { step: 'value', version: 2 });
  }, []);

  useEffect(() => {
    const expected = Math.min(width, 520);
    setPageWidth((current) => Math.abs(current - expected) > 1 ? expected : current);
  }, [width]);

  useEffect(() => {
    scroller.current?.scrollTo({ x: index * pageWidth, animated: false });
    // Width changes come from an actual viewport/layout change. `index` is
    // intentionally not a dependency: button and swipe navigation scroll on
    // their own, without a second jump from this repair effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidth]);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      `Page ${index + 1} of ${slides.length}. ${slides[index]?.title ?? ''}`,
    );
  }, [index]);

  const measurePager = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    if (measured > 0 && Math.abs(measured - pageWidth) > 1) setPageWidth(measured);
  };

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, next));
    if (clamped !== index) {
      trackAnalyticsEvent('onboarding_viewed', { step: clamped === 0 ? 'value' : 'journey', version: 2 });
    }
    setIndex(clamped);
    scroller.current?.scrollTo({ x: clamped * pageWidth, animated: !reducedMotion });
  };

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.max(0, Math.min(slides.length - 1, Math.round(event.nativeEvent.contentOffset.x / pageWidth)));
    if (next !== index) {
      setIndex(next);
      trackAnalyticsEvent('onboarding_viewed', { step: next === 0 ? 'value' : 'journey', version: 2 });
      if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
    }
  };

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={[styles.topline, compact && styles.compactTopline]}>
        <View style={styles.wordmark}>
          <Sparkle size={11} color={colors.brass} twinkle />
          <Text maxFontSizeMultiplier={1.6} style={textStyles.eyebrow}>THIRTY NIGHTS</Text>
        </View>
        {onPreview && !prioritizeText ? <TextButton onPress={onPreview}>Developer preview</TextButton> : <View />}
      </View>

      <Animated.ScrollView
        ref={scroller as never}
        horizontal
        pagingEnabled
        directionalLockEnabled
        nestedScrollEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onLayout={measurePager}
        onMomentumScrollEnd={onMomentumEnd}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: nativeAnimationDriver })}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {slides.map((slide, slideIndex) => {
          const inputRange = [(slideIndex - 1) * pageWidth, slideIndex * pageWidth, (slideIndex + 1) * pageWidth];
          const pageStyle = reducedMotion ? null : {
            opacity: scrollX.interpolate({ inputRange, outputRange: [0, 1, 0], extrapolate: 'clamp' as const }),
            transform: [
              { scale: scrollX.interpolate({ inputRange, outputRange: [0.96, 1, 0.96], extrapolate: 'clamp' as const }) },
            ],
          };
          return (
            <View
              key={slide.eyebrow}
              accessibilityElementsHidden={slideIndex !== index}
              importantForAccessibility={slideIndex === index ? 'auto' : 'no-hide-descendants'}
              style={[styles.page, { width: pageWidth }]}
            >
              <ScrollView
                bounces={false}
                nestedScrollEnabled
                showsVerticalScrollIndicator={prioritizeText}
                style={styles.verticalPage}
                contentContainerStyle={[styles.pageScroll, compact && styles.compactPageScroll]}
              >
                <Animated.View style={[styles.pageInner, compact && styles.compactPageInner, prioritizeText && styles.accessiblePageInner, pageStyle]}>
                  {!prioritizeText ? (
                    <View style={[styles.visual, compact && styles.compactVisual]}>
                      <SlideVisual kind={slide.visual} reducedMotion={reducedMotion} compact={compact} />
                    </View>
                  ) : null}
                  <View style={styles.copy}>
                    <Text maxFontSizeMultiplier={2} style={styles.slideAside}>{slide.eyebrow}</Text>
                    <Text maxFontSizeMultiplier={2} accessibilityRole="header" style={[styles.title, compact && styles.compactTitle, prioritizeText && styles.accessibleTitle]}>{slide.title}</Text>
                    <Text maxFontSizeMultiplier={2} style={styles.body}>{slide.body}</Text>
                  </View>

                  {slide.visual === 'seven' ? (
                    <View style={styles.offerCard}>
                      <View style={styles.offerDot}><Sparkle size={10} color={colors.white} /></View>
                      <Text maxFontSizeMultiplier={2} style={styles.offerText}>
                        First 7 nights included. <Text style={styles.offerStrong}>No card required.</Text>
                      </Text>
                    </View>
                  ) : (
                    <>
                      <JourneyTimeline />
                      <View style={styles.privacyCard}>
                        <ShieldCheck size={19} strokeWidth={1.9} color={colors.mossText} />
                        <Text maxFontSizeMultiplier={2} style={styles.privacyText}>
                          Recordings stay here. Nothing uploads or reaches AI without your permission.
                        </Text>
                      </View>
                    </>
                  )}
                </Animated.View>
              </ScrollView>
            </View>
          );
        })}
      </Animated.ScrollView>

      <View style={[styles.footer, compact && styles.compactFooter]}>
        <View accessibilityRole="tablist" style={styles.dots}>
          {slides.map((slide, dotIndex) => {
            const active = dotIndex === index;
            return (
              <Pressable
                key={slide.eyebrow}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Page ${dotIndex + 1} of ${slides.length}: ${slide.eyebrow}`}
                onPress={() => goTo(dotIndex)}
                hitSlop={14}
                style={styles.dotTarget}
              >
                <View style={[styles.dot, active && styles.activeDot]} />
              </Pressable>
            );
          })}
          <Text maxFontSizeMultiplier={1.6} style={styles.pageCount}>{index + 1} / {slides.length}</Text>
        </View>
        <Button icon={ArrowRight} onPress={() => (last ? onComplete() : goTo(index + 1))}>
          {last ? 'Choose a reminder' : 'See how it works'}
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 6,
    paddingBottom: 12,
  },
  topline: {
    flexShrink: 0,
    minHeight: 48,
    marginHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactTopline: {
    minHeight: 42,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pager: {
    flex: 1,
    minHeight: 0,
  },
  page: {
    flex: 1,
    minHeight: 0,
  },
  verticalPage: {
    flex: 1,
    minHeight: 0,
  },
  pageScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  compactPageScroll: {
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  pageInner: {
    width: '100%',
    gap: 22,
  },
  compactPageInner: {
    gap: 15,
  },
  accessiblePageInner: {
    gap: 12,
  },
  visual: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactVisual: {
    minHeight: 142,
  },
  cardGlow: {
    alignSelf: 'center',
  },
  stickerCard: {
    width: '100%',
    maxWidth: 330,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderRadius: radii.xl,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    overflow: 'hidden',
    ...shadows.floating,
  },
  compactStickerCard: {
    maxWidth: 290,
    paddingVertical: 16,
  },
  miniGrid: {
    width: 224,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  compactMiniGrid: {
    width: 184,
  },
  miniCell: {
    width: 46,
    height: 46,
  },
  compactMiniCell: {
    width: 38,
    height: 38,
  },
  miniArt: {
    width: '110%',
    height: '110%',
    alignSelf: 'center',
  },
  miniFuture: {
    opacity: 0.48,
  },
  miniCaption: {
    ...textStyles.eyebrow,
    marginTop: 16,
    color: colors.roseText,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: weight.semibold,
  },
  journeyCard: {
    width: '100%',
    maxWidth: 350,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 22,
    borderRadius: radii.xl,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    overflow: 'hidden',
    ...shadows.floating,
  },
  compactJourneyCard: {
    paddingTop: 22,
    paddingBottom: 17,
  },
  journeyJournal: {
    position: 'absolute',
    width: 112,
    height: 112,
    right: -24,
    bottom: -28,
    opacity: 0.16,
    transform: [{ rotate: '8deg' }],
  },
  journeyRail: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  journeyStop: {
    width: 92,
    alignItems: 'center',
    gap: 9,
  },
  journeyNumber: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: surfaces.selected,
  },
  journeyNumberFinal: {
    backgroundColor: colors.roseDeep,
    borderColor: colors.roseDeep,
  },
  journeyNumberText: {
    color: colors.paperInk,
    fontFamily: typography.serifSemiBold,
    fontSize: 25,
  },
  journeyNumberTextFinal: {
    color: colors.white,
  },
  journeyLabel: {
    ...textStyles.eyebrow,
    color: colors.paperDim,
    fontSize: 8.5,
    letterSpacing: 1,
    textAlign: 'center',
  },
  journeyLine: {
    flex: 1,
    height: 1,
    marginHorizontal: 4,
    backgroundColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  journeySparkle: {
    backgroundColor: surfaces.card,
  },
  journeyCaption: {
    ...textStyles.eyebrow,
    marginTop: 20,
    color: colors.roseText,
    fontSize: 9,
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  copy: {
    gap: 9,
  },
  slideAside: {
    color: colors.paperDim,
    fontFamily: typography.serifItalic,
    fontSize: 17,
  },
  title: {
    ...textStyles.title,
    fontSize: 38,
    lineHeight: 45,
  },
  compactTitle: {
    fontSize: 33,
    lineHeight: 39,
  },
  accessibleTitle: {
    fontSize: 26,
    lineHeight: 32,
  },
  body: {
    ...textStyles.bodySmall,
    fontSize: 16,
    lineHeight: 24,
  },
  offerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(190,111,124,0.24)',
    backgroundColor: surfaces.selected,
  },
  offerDot: {
    flexShrink: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.roseDeep,
  },
  offerText: {
    flex: 1,
    color: colors.paperInk,
    fontFamily: typography.serifMedium,
    fontSize: 16,
    lineHeight: 23,
  },
  offerStrong: {
    color: colors.roseText,
    fontWeight: weight.semibold,
  },
  timeline: {
    gap: 0,
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(184,134,53,0.2)',
    backgroundColor: surfaces.card,
  },
  timelineRow: {
    minHeight: 58,
    flexDirection: 'row',
    gap: 13,
  },
  timelineRail: {
    width: 12,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
    backgroundColor: colors.rose,
    borderWidth: 2,
    borderColor: colors.white,
  },
  timelineDotFinal: {
    backgroundColor: colors.roseDeep,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    marginVertical: 4,
    backgroundColor: colors.lineStrong,
  },
  timelineCopy: {
    flex: 1,
    paddingBottom: 13,
  },
  timelineLabel: {
    color: colors.roseText,
    fontFamily: typography.monoMedium,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  timelineBody: {
    ...textStyles.bodySmall,
    marginTop: 3,
    fontSize: 14,
    lineHeight: 20,
  },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(90,116,98,0.23)',
    backgroundColor: surfaces.success,
  },
  privacyText: {
    flex: 1,
    color: colors.paperInk,
    fontFamily: typography.sans,
    fontWeight: weight.medium,
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    flexShrink: 0,
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 2,
  },
  compactFooter: {
    paddingHorizontal: 20,
    paddingTop: 2,
  },
  dots: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dotTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.rose,
    backgroundColor: 'transparent',
  },
  activeDot: {
    width: 22,
    backgroundColor: colors.roseDeep,
    borderColor: colors.roseDeep,
  },
  pageCount: {
    ...textStyles.caption,
    flex: 1,
    color: colors.paperDim,
    fontSize: 11,
    textAlign: 'right',
  },
});
