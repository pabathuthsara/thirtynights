import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ArrowRight } from 'lucide-react-native';

import { Button, TextButton } from '@/components/Buttons';
import { Screen } from '@/components/Screen';
import { Glow, Sparkle } from '@/components/Sparkle';
import { Waveform } from '@/components/Waveform';
import { colors, motion, nativeAnimationDriver, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { completedStickerAssets, embossedStickerAssets, keepsakeDecorations, stickerAssetForNight } from '@/data/keepsakeAssets';

const slides = [
  {
    eyebrow: 'A question each night',
    title: 'A small ritual, kept just for you.',
    body: 'At the quiet hour you choose, one thoughtful question arrives for you to answer out loud.',
    visual: 'moon',
  },
  {
    eyebrow: 'Speak once, honestly',
    title: 'Say it once. Then let it rest.',
    body: 'Tap to record and seal when you are done. There is no editing and no immediate playback.',
    visual: 'record',
  },
  {
    eyebrow: 'Your answer is sealed',
    title: 'Each night becomes a little keepsake.',
    body: 'Your sticker sheet quietly fills while every voice note stays tucked away until its reflection.',
    visual: 'sheet',
  },
  {
    eyebrow: 'Time reveals the story',
    title: 'Notice what changed when you look back.',
    body: 'The first seven nights are yours. Your reflection appears only when there is a real story to reveal.',
    visual: 'seven',
  },
] as const;

type Visual = (typeof slides)[number]['visual'];

function SlideVisual({ kind, reducedMotion }: { kind: Visual; reducedMotion: boolean }) {
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
    transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -9] }) }],
  };

  if (kind === 'sheet' || kind === 'seven') {
    // Slide four promises the first seven nights, so it shows a seven-night
    // sheet — not a 30-slot board with 23 empty places.
    const total = kind === 'seven' ? 7 : 18;
    const earned = kind === 'seven' ? 4 : 11;
    const columns = kind === 'seven' ? 4 : 6;
    return (
      <Animated.View style={[styles.stickerCard, drift]}>
        <Glow size={230} color={colors.rose} opacity={0.24} style={styles.cardGlow} />
        <View style={[styles.miniGrid, { width: columns * 40 }]}>
          {Array.from({ length: total }, (_, index) => (
            <View key={index} style={styles.miniCell}>
              {index < earned ? (
                <Image source={stickerAssetForNight(completedStickerAssets, index + 1)} resizeMode="contain" style={styles.miniArt} />
              ) : index === earned ? (
                <View style={styles.miniToday}>
                  <Image source={stickerAssetForNight(embossedStickerAssets, index + 1)} resizeMode="contain" style={[styles.miniArt, styles.miniTodayArt]} />
                </View>
              ) : (
                <Image source={stickerAssetForNight(embossedStickerAssets, index + 1)} resizeMode="contain" style={[styles.miniArt, styles.miniFuture]} />
              )}
            </View>
          ))}
        </View>
        {kind === 'seven' ? <Text style={styles.miniCaption}>Seven nights, included</Text> : null}
      </Animated.View>
    );
  }

  if (kind === 'record') {
    return (
      <Animated.View style={[styles.recordVisual, drift]}>
        <Glow size={230} color={colors.rose} opacity={0.3} style={styles.cardGlow} />
        <Image source={keepsakeDecorations.journal} resizeMode="contain" style={styles.heroArt} />
        <View style={styles.recordWave}>
          <Waveform compact active />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.heroGlow, drift]}>
      <Glow size={240} color={colors.rose} opacity={0.32} style={styles.cardGlow} />
      <Image source={stickerAssetForNight(completedStickerAssets, 1)} resizeMode="contain" style={styles.heroArt} />
      <Sparkle size={16} color={colors.brass} twinkle style={styles.heroSparkleOne} />
      <Sparkle size={11} color={colors.rose} twinkle delay={520} style={styles.heroSparkleTwo} />
    </Animated.View>
  );
}

export function OnboardingScreen({ onComplete, onPreview }: { onComplete: () => void; onPreview?: () => void }) {
  const [index, setIndex] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(width, 520);
  const last = index === slides.length - 1;

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, next));
    setIndex(clamped);
    scroller.current?.scrollTo({ x: clamped * pageWidth, animated: !reducedMotion });
  };

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    if (next !== index) {
      setIndex(next);
      if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
    }
  };

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={styles.topline}>
        <View style={styles.wordmark}>
          <Sparkle size={11} color={colors.brass} twinkle />
          <Text style={textStyles.eyebrow}>THIRTY NIGHTS</Text>
        </View>
        {onPreview ? <TextButton onPress={onPreview}>Developer preview</TextButton> : <View />}
      </View>

      {/* Swipeable. Every user tries this first. */}
      <Animated.ScrollView
        ref={scroller as never}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: nativeAnimationDriver })}
        scrollEventThrottle={16}
        style={styles.pager}
        contentContainerStyle={{ width: pageWidth * slides.length }}
      >
        {slides.map((slide, slideIndex) => {
          const inputRange = [(slideIndex - 1) * pageWidth, slideIndex * pageWidth, (slideIndex + 1) * pageWidth];
          const pageStyle = reducedMotion ? null : {
            opacity: scrollX.interpolate({ inputRange, outputRange: [0, 1, 0], extrapolate: 'clamp' as const }),
            transform: [
              { scale: scrollX.interpolate({ inputRange, outputRange: [0.9, 1, 0.9], extrapolate: 'clamp' as const }) },
            ],
          };
          return (
            <View key={slide.eyebrow} style={[styles.page, { width: pageWidth }]}>
              <Animated.View style={[styles.pageInner, pageStyle]}>
                <View style={styles.visual}>
                  <SlideVisual kind={slide.visual} reducedMotion={reducedMotion} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.slideAside}>{slide.eyebrow}</Text>
                  <Text accessibilityRole="header" style={styles.title}>{slide.title}</Text>
                  <Text style={styles.body}>{slide.body}</Text>
                </View>
              </Animated.View>
            </View>
          );
        })}
      </Animated.ScrollView>

      <View style={styles.footer}>
        <View accessibilityRole="tablist" style={styles.dots}>
          {slides.map((slide, dotIndex) => {
            const active = dotIndex === index;
            return (
              <Pressable
                key={slide.eyebrow}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Slide ${dotIndex + 1} of ${slides.length}: ${slide.eyebrow}`}
                onPress={() => goTo(dotIndex)}
                hitSlop={14}
                style={styles.dotTarget}
              >
                <View style={[styles.dot, active && styles.activeDot]} />
              </Pressable>
            );
          })}
          <View style={styles.skipSlot}>
            {!last ? <TextButton onPress={onComplete}>Skip</TextButton> : null}
          </View>
        </View>
        <Button icon={ArrowRight} onPress={() => (last ? onComplete() : goTo(index + 1))}>
          {last ? 'Choose your hour' : 'Continue'}
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    gap: 8,
  },
  topline: {
    height: 48,
    marginHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: 'center',
  },
  pageInner: {
    flex: 1,
    justifyContent: 'center',
    gap: 34,
    paddingHorizontal: 24,
  },
  visual: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGlow: {
    width: 176,
    height: 176,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGlow: { alignSelf: 'center' },
  heroArt: { width: '100%', height: '100%' },
  heroSparkleOne: { position: 'absolute', top: 4, right: 2 },
  heroSparkleTwo: { position: 'absolute', bottom: 14, left: 6 },
  recordVisual: {
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordWave: {
    position: 'absolute',
    bottom: -6,
    width: 180,
  },
  stickerCard: {
    alignItems: 'center',
    padding: 18,
    borderRadius: radii.lg,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    ...shadows.floating,
  },
  miniGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  miniCell: { width: 34, height: 34 },
  miniArt: { width: '110%', height: '110%', alignSelf: 'center' },
  miniToday: {
    flex: 1,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: 'rgba(250,226,228,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniTodayArt: { opacity: 0.92 },
  miniFuture: { opacity: 0.5 },
  miniCaption: {
    ...textStyles.caption,
    marginTop: 12,
    color: colors.roseText,
    fontWeight: weight.semibold,
  },
  copy: {
    gap: 12,
  },
  // A written aside, not a shouted kicker on every slide.
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
  body: {
    ...textStyles.bodySmall,
    fontSize: 16,
    lineHeight: 25,
  },
  footer: {
    gap: 18,
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dotTarget: {
    minWidth: 26,
    minHeight: 34,
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
  skipSlot: {
    flex: 1,
    alignItems: 'flex-end',
  },
});
