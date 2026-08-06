import { createContext, useContext, useEffect, useMemo, useRef, type PropsWithChildren, type ReactNode } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_ISLAND_HEIGHT, TAB_ISLAND_LIFT } from '@/components/TabBar';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { keepsakeTextures } from '@/data/keepsakeAssets';
import { Glow, Moon, Sparkle } from '@/components/Sparkle';
import { moonIllumination, moonPhase } from '@/domain/moon';
import { colors, gradients, motion, nativeAnimationDriver, night, nightGradients } from '@/theme';

export type ScreenVariant = 'day' | 'dusk' | 'night';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  paper?: boolean;
  header?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  /** Set when the screen contains a text input. */
  avoidKeyboard?: boolean;
  /** Nightfall. `night` dresses the ritual screens in the moon sticker's plum
   *  and candlelight; `dusk` deepens the paper once the quiet hour has passed
   *  while staying light enough for the day ink. */
  variant?: ScreenVariant;
  /** Set when a tab bar sits beneath this screen. The bar is the thing actually
   *  touching the bottom of the device, so it — not the screen — pads for the
   *  gesture area; padding both would open a dead band above the bar. */
  tabbed?: boolean;
}>;

const EntranceContext = createContext<Animated.Value | null>(null);

/**
 * Wraps a block so it arrives slightly after the one before it. The design
 * system asks for the header, sheet, card and navigation to land in sequence
 * rather than as a single slab (§11.2 "Page entrance").
 */
export function Stagger({ index = 0, children, style }: PropsWithChildren<{ index?: number; style?: StyleProp<ViewStyle> }>) {
  const entrance = useContext(EntranceContext);
  const reducedMotion = useReducedMotion();

  const animated = useMemo(() => {
    if (!entrance || reducedMotion) return null;
    // Each block consumes a window of the shared 0→1 driver, offset by index.
    const start = Math.min(0.55, index * 0.11);
    const end = Math.min(1, start + 0.45);
    return {
      opacity: entrance.interpolate({ inputRange: [start, end], outputRange: [0, 1], extrapolate: 'clamp' }),
      transform: [{
        translateY: entrance.interpolate({ inputRange: [start, end], outputRange: [14, 0], extrapolate: 'clamp' }),
      }],
    };
  }, [entrance, index, reducedMotion]);

  if (!animated) return <View style={style}>{children}</View>;
  return (
    <Animated.View
      // Android otherwise applies the animated opacity to each nested draw
      // operation independently. On translucent paper cards that produced
      // pale rectangular bands behind text and controls during entrance.
      needsOffscreenAlphaCompositing={Platform.OS === 'android'}
      renderToHardwareTextureAndroid={Platform.OS === 'android'}
      style={[style, animated]}
    >
      {children}
    </Animated.View>
  );
}

/** Softly drifting watercolour blooms — the only thing moving on a resting screen. */
function Bloom({ style, delay, reducedMotion }: { style: StyleProp<ViewStyle>; delay: number; reducedMotion: boolean }) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(drift, { toValue: 1, duration: 11000, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
      Animated.timing(drift, { toValue: 0, duration: 11000, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [delay, drift, reducedMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          transform: [
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) },
            { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
          ],
        },
      ]}
    />
  );
}

function PaperAtmosphere({ report, dusk, reducedMotion }: { report: boolean; dusk: boolean; reducedMotion: boolean }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={dusk ? nightGradients.dusk : report ? gradients.paperPage : gradients.page}
        locations={[0, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Image source={keepsakeTextures.paperBackground} resizeMode="cover" style={styles.paperTexture} />
      {/* Light falling from the top of the page. A gradient, so it has no edge. */}
      <LinearGradient
        colors={gradients.highlight}
        locations={[0, 1]}
        style={styles.paperHighlight}
      />
      <Bloom style={[styles.watercolorTop, dusk && styles.duskBloomTop]} delay={0} reducedMotion={reducedMotion} />
      <Bloom style={styles.watercolorSide} delay={2600} reducedMotion={reducedMotion} />
      <Bloom style={[styles.watercolorLow, dusk && styles.duskBloomLow]} delay={5200} reducedMotion={reducedMotion} />
      {/* Vignette keeps the warm paper from washing out at the edges. At dusk it
          deepens, so the page reads as evening without costing the ink contrast. */}
      <LinearGradient
        colors={[dusk ? 'rgba(94,52,68,0.20)' : 'rgba(160,110,124,0.09)', 'rgba(160,110,124,0)']}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/** Fixed star positions — scattered, not gridded, and kept away from centre
 *  stage where the ritual content lives. */
const STARS = [
  { top: '7%', left: '12%', size: 10, delay: 0 },
  { top: '11%', right: '18%', size: 13, delay: 900 },
  { top: '22%', left: '26%', size: 8, delay: 2100 },
  { top: '17%', right: '8%', size: 9, delay: 3300 },
  { top: '31%', left: '9%', size: 11, delay: 1500 },
  { top: '38%', right: '13%', size: 8, delay: 2700 },
] as const;

function NightAtmosphere({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={nightGradients.page}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* The same handmade paper, barely there, so night still feels like the
          same object as day — a dark page, not a different app. */}
      <Image source={keepsakeTextures.paperBackground} resizeMode="cover" style={styles.nightTexture} />
      {/* Moonlight pooling from the top. */}
      <LinearGradient
        colors={['rgba(228,194,122,0.10)', 'rgba(228,194,122,0)']}
        style={styles.paperHighlight}
      />
      <Glow size={340} color={night.candle} opacity={0.16} style={styles.moonGlow} />
      {/* The moon actually in the sky tonight, in the same phase. */}
      <View style={styles.moonMark}>
        <Moon size={38} phase={moonPhase()} illumination={moonIllumination()} color={night.candle} />
      </View>
      {STARS.map(({ size, delay, ...position }, index) => (
        <Sparkle
          key={index}
          size={size}
          color={night.candle}
          twinkle={!reducedMotion}
          delay={delay}
          style={[styles.star, position]}
        />
      ))}
      <Bloom style={styles.nightBloom} delay={1200} reducedMotion={reducedMotion} />
      {/* The room falls away toward the bottom of the page. */}
      <LinearGradient
        colors={['rgba(15,6,12,0.42)', 'rgba(15,6,12,0)']}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export function Screen({
  children,
  scroll = true,
  paper = false,
  header,
  contentStyle,
  keyboardShouldPersistTaps = 'handled',
  avoidKeyboard = false,
  variant = 'day',
  tabbed = false,
}: ScreenProps) {
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const entrance = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      entrance.setValue(1);
      return;
    }
    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: motion.slow + motion.stagger * 4,
      easing: motion.easeGentle,
      useNativeDriver: nativeAnimationDriver,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, reducedMotion]);

  // The floating tab island hovers over the page, so it reserves no layout space
  // of its own. Screens under it have to keep that much clear or their last line
  // sits beneath the glass.
  const content = (
    <View
      style={[
        styles.content,
        contentStyle,
        tabbed && { paddingBottom: Math.max(insets.bottom, TAB_ISLAND_LIFT) + TAB_ISLAND_HEIGHT + TAB_ISLAND_LIFT },
      ]}
    >
      {header}
      {children}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode="interactive"
      contentInsetAdjustmentBehavior="automatic"
    >
      {content}
    </ScrollView>
  ) : content;

  return (
    <EntranceContext.Provider value={entrance}>
      <View style={[styles.stage, variant === 'night' && styles.nightStage]}>
        <View style={[styles.device, variant === 'night' && styles.nightDevice]}>
          {variant === 'night'
            ? <NightAtmosphere reducedMotion={reducedMotion} />
            : <PaperAtmosphere report={paper} dusk={variant === 'dusk'} reducedMotion={reducedMotion} />}
          <SafeAreaView style={styles.safe} edges={tabbed ? ['top'] : ['top', 'bottom']}>
            {avoidKeyboard ? (
              <KeyboardAvoidingView
                style={styles.safe}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
              >
                {body}
              </KeyboardAvoidingView>
            ) : body}
          </SafeAreaView>
        </View>
      </View>
    </EntranceContext.Provider>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
  },
  device: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  safe: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
  },
  paperTexture: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    // The design system caps texture at 2–9%; above that it stops being a
    // texture and starts being the background. Sitting at the top of that range
    // puts the tactility on the page, where nothing competes with it — the
    // cards themselves stay clean so the sticker art keeps the stage.
    opacity: 0.09,
  },
  paperHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '46%',
  },
  watercolorTop: {
    position: 'absolute',
    width: 300,
    height: 250,
    borderRadius: 150,
    right: -112,
    top: -120,
    backgroundColor: colors.watercolor,
    opacity: 0.58,
  },
  watercolorSide: {
    position: 'absolute',
    width: 180,
    height: 270,
    borderRadius: 110,
    left: -122,
    bottom: 80,
    backgroundColor: 'rgba(228,194,122,0.12)',
  },
  watercolorLow: {
    position: 'absolute',
    width: 240,
    height: 200,
    borderRadius: 120,
    right: -90,
    bottom: -60,
    backgroundColor: 'rgba(216,140,153,0.10)',
  },
  duskBloomTop: {
    backgroundColor: 'rgba(190,111,124,0.22)',
  },
  duskBloomLow: {
    backgroundColor: 'rgba(148,88,110,0.16)',
  },

  nightStage: {
    backgroundColor: night.backgroundDeep,
  },
  nightDevice: {
    backgroundColor: night.backgroundDeep,
  },
  nightTexture: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.05,
  },
  moonGlow: {
    top: -170,
    alignSelf: 'center',
  },
  // Clear of the header row and of the nearest star.
  moonMark: {
    position: 'absolute',
    top: '13.5%',
    right: '11%',
    opacity: 0.75,
  },
  star: {
    position: 'absolute',
  },
  nightBloom: {
    position: 'absolute',
    width: 260,
    height: 230,
    borderRadius: 140,
    left: -110,
    bottom: -70,
    backgroundColor: 'rgba(216,140,153,0.07)',
  },
});
