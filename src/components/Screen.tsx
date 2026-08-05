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
import { SafeAreaView } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { keepsakeTextures } from '@/data/keepsakeAssets';
import { colors, gradients, motion } from '@/theme';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  paper?: boolean;
  header?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  /** Set when the screen contains a text input. */
  avoidKeyboard?: boolean;
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
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Softly drifting watercolour blooms — the only thing moving on a resting screen. */
function Bloom({ style, delay, reducedMotion }: { style: StyleProp<ViewStyle>; delay: number; reducedMotion: boolean }) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(drift, { toValue: 1, duration: 11000, easing: motion.easeInOut, useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 11000, easing: motion.easeInOut, useNativeDriver: true }),
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

function PaperAtmosphere({ report, reducedMotion }: { report: boolean; reducedMotion: boolean }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={report ? gradients.paperPage : gradients.page}
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
      <Bloom style={styles.watercolorTop} delay={0} reducedMotion={reducedMotion} />
      <Bloom style={styles.watercolorSide} delay={2600} reducedMotion={reducedMotion} />
      <Bloom style={styles.watercolorLow} delay={5200} reducedMotion={reducedMotion} />
      {/* Vignette keeps the warm paper from washing out at the edges. */}
      <LinearGradient
        colors={['rgba(160,110,124,0.09)', 'rgba(160,110,124,0)']}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0.55 }}
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
}: ScreenProps) {
  const reducedMotion = useReducedMotion();
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
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, reducedMotion]);

  const content = (
    <View style={[styles.content, contentStyle]}>
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
    >
      {content}
    </ScrollView>
  ) : content;

  return (
    <EntranceContext.Provider value={entrance}>
      <View style={styles.stage}>
        <View style={styles.device}>
          <PaperAtmosphere report={paper} reducedMotion={reducedMotion} />
          <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
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
    // texture and starts being the background.
    opacity: 0.08,
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
});
