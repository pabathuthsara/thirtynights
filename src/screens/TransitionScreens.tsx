import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Button } from '@/components/Buttons';
import { Screen } from '@/components/Screen';
import { Glow, Sparkle } from '@/components/Sparkle';
import { colors, gradients, motion, nativeAnimationDriver, night, radii, textStyles, typography, weight } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { keepsakeDecorations } from '@/data/keepsakeAssets';

const STAGE = 300;
const ENVELOPE_W = 258;
const ENVELOPE_H = 160;
const SEAL = 78;

/** `null` deliberately means "still checking". Timed screens must not assume
 *  assistive technology is off during that brief async window and advance out
 *  from under someone before the platform answers. */
function useScreenReaderEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => { if (active) setEnabled(value); })
      .catch(() => { if (active) setEnabled(false); });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

/**
 * The sealing ceremony. It ends sealed — the reveal is its own screen now.
 *
 * Everything lives in one centred stage, and the seal is an absolutely
 * positioned overlay that fills that same stage. Its resting transform is
 * therefore *exactly* the envelope's centre on every device — the previous
 * version animated to a hard-coded `translateY: -75` that only lined up with
 * the target ring at one screen height.
 *
 * Beats: the take folds inward → the flap closes → the seal presses down →
 * warm light contracts into the wax → the words arrive.
 *
 * The sticker used to spring out over the receding envelope, which left a pale
 * slab of letter sitting behind it — two objects competing for one moment. It
 * now has a stage of its own in `RewardScreen`, so this screen can simply end
 * on a sealed envelope and hand over.
 */
export function SealingScreen({ nightIndex = 1, onDone }: { nightIndex?: number; onDone: () => void }) {
  const fold = useRef(new Animated.Value(0)).current;
  const flap = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(0)).current;
  const impact = useRef(new Animated.Value(0)).current;
  const light = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const screenReaderEnabled = useScreenReaderEnabled();
  const { width, height, fontScale } = useWindowDimensions();
  const [pressed, setPressed] = useState(false);
  const [ceremonyComplete, setCeremonyComplete] = useState(false);

  // Keep the original proportions, but let the entire object give way before
  // text or a device edge does. At 320×568 this leaves a 272×218 stage; large
  // system text gives the copy a little more of the vertical budget.
  const stageScale = Math.max(0.68, Math.min(
    1,
    (width - 48) / STAGE,
    (height * (fontScale > 1.2 ? 0.34 : 0.42)) / 240,
  ));
  const stageWidth = STAGE * stageScale;
  const stageHeight = 240 * stageScale;
  const envelopeWidth = ENVELOPE_W * stageScale;
  const envelopeHeight = ENVELOPE_H * stageScale;
  const sealSize = SEAL * stageScale;
  const glowSize = 190 * stageScale;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`Night ${nightIndex} is sealed.`);
  }, [nightIndex]);

  useEffect(() => {
    if (reducedMotion) {
      [fold, flap, drop, impact, light, words].forEach((value) => value.setValue(1));
      setPressed(true);
      setCeremonyComplete(true);
      return;
    }

    const sequence = Animated.sequence([
      // 1 — the take folds inward and the flap comes down over it.
      Animated.parallel([
        Animated.timing(fold, { toValue: 1, duration: 300, easing: motion.easeGentle, useNativeDriver: nativeAnimationDriver }),
        Animated.timing(flap, { toValue: 1, duration: 380, easing: motion.easeSoft, useNativeDriver: nativeAnimationDriver }),
      ]),
      // 2 — the wax presses down onto the fold.
      Animated.timing(drop, { toValue: 1, duration: 380, easing: motion.easeGentle, useNativeDriver: nativeAnimationDriver }),
      // 3 — contact.
      Animated.parallel([
        Animated.sequence([
          Animated.timing(impact, { toValue: 1, duration: 90, easing: motion.easeSoft, useNativeDriver: nativeAnimationDriver }),
          Animated.spring(impact, { toValue: 0, damping: 9, stiffness: 260, mass: 0.5, useNativeDriver: nativeAnimationDriver }),
        ]),
        Animated.timing(light, { toValue: 1, duration: 520, easing: motion.easeGentle, useNativeDriver: nativeAnimationDriver }),
      ]),
      // 4 — a held breath, then the words settle under the sealed envelope.
      Animated.delay(220),
      Animated.timing(words, { toValue: 1, duration: 460, easing: motion.easeSoft, useNativeDriver: nativeAnimationDriver }),
    ]);

    // Fire the haptics exactly when the wax lands and when the sticker pops,
    // not when everything finishes.
    const contact = setTimeout(() => {
      setPressed(true);
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    }, 1060);

    sequence.start(({ finished }) => {
      // A short beat on the sealed envelope, then the reveal takes over.
      if (finished) setCeremonyComplete(true);
    });

    return () => {
      clearTimeout(contact);
      sequence.stop();
    };
  }, [drop, flap, fold, impact, light, nightIndex, reducedMotion, words]);

  useEffect(() => {
    if (!ceremonyComplete || screenReaderEnabled !== false) return;
    // Reduced motion removes movement, not the confirmation. Its longer hold is
    // preserved; the animated ceremony keeps its original final beat.
    const timer = setTimeout(onDone, reducedMotion ? 1500 : 620);
    return () => clearTimeout(timer);
  }, [ceremonyComplete, onDone, reducedMotion, screenReaderEnabled]);

  return (
    <Screen variant="night" contentStyle={styles.center}>
      <View style={[styles.stage, { width: stageWidth, height: stageHeight }]}>
        {/* The take, folding inward and fading under the flap. */}
        <Animated.View
          style={[
            styles.takeLines,
            { width: (ENVELOPE_W - 92) * stageScale, gap: 9 * stageScale },
            {
              opacity: fold.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.5, 0] }),
              transform: [{ scaleX: fold.interpolate({ inputRange: [0, 1], outputRange: [1, 0.05] }) }],
            },
          ]}
        >
          {[0.82, 1, 0.68].map((scale, index) => (
            <View key={index} style={[styles.takeLine, { width: `${scale * 100}%` }]} />
          ))}
        </Animated.View>

        <View style={[
          styles.envelope,
          { width: envelopeWidth, height: envelopeHeight, borderRadius: radii.md * stageScale },
        ]}>
          <LinearGradient colors={['#FFFCF7', '#F6E7DF']} style={StyleSheet.absoluteFill} />
          <View style={[styles.envelopeSeam, { top: envelopeHeight / 2 }]} />
          {/* The flap folds shut over the take. */}
          <Animated.View
            style={[
              styles.flap,
              {
                height: envelopeHeight * 0.62,
                borderBottomLeftRadius: 120 * stageScale,
                borderBottomRightRadius: 120 * stageScale,
              },
              {
                opacity: flap.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] }),
                transform: [
                  { perspective: 700 },
                  { rotateX: flap.interpolate({ inputRange: [0, 1], outputRange: ['-84deg', '0deg'] }) },
                ],
              },
            ]}
          >
            <LinearGradient colors={['#F9EDE6', '#EFD9D1']} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>

        {/* Warm light contracting into the wax. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.overlay,
            {
              opacity: light.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.95, 0] }),
              transform: [{ scale: light.interpolate({ inputRange: [0, 1], outputRange: [2.6, 0.75] }) }],
            },
          ]}
        >
          <Glow
            size={glowSize}
            color={colors.brass}
            opacity={0.85}
            style={{ left: (stageWidth - glowSize) / 2, top: (stageHeight - glowSize) / 2 }}
          />
        </Animated.View>

        {/* The seal. Absolutely fills the stage and is centred within it, so its
            resting position is the envelope's centre on any screen. */}
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: drop.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.55, 1] }),
              transform: [
                { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-150 * stageScale, 0] }) },
                { scale: drop.interpolate({ inputRange: [0, 1], outputRange: [1.85, 1] }) },
              ],
            },
          ]}
        >
          <Animated.View
            style={{
              transform: [
                { scaleX: impact.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] }) },
                { scaleY: impact.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }) },
              ],
            }}
          >
            <View style={[
              styles.sealShadow,
              { width: sealSize, height: sealSize, borderRadius: sealSize / 2 },
            ]}>
              <Image source={keepsakeDecorations.waxSeal} resizeMode="contain" style={styles.sealImage} />
              {/* A single shimmer travelling across the wax once it has set. */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.gleam,
                  {
                    top: sealSize * 0.18,
                    left: sealSize * 0.2,
                    width: 16 * stageScale,
                    height: sealSize * 0.7,
                  },
                  {
                    opacity: light.interpolate({ inputRange: [0, 0.3, 0.8, 1], outputRange: [0, 0, 0.85, 0.35] }),
                    transform: [
                      { rotate: '-28deg' },
                      { translateX: light.interpolate({ inputRange: [0, 1], outputRange: [-30, 26] }) },
                    ],
                  },
                ]}
              />
            </View>
          </Animated.View>
        </Animated.View>

        {pressed ? (
          <>
            <Sparkle
              size={13 * stageScale}
              color={night.candle}
              twinkle
              style={{ position: 'absolute', top: 26 * stageScale, right: 42 * stageScale }}
            />
            <Sparkle
              size={10 * stageScale}
              color={colors.rose}
              twinkle
              delay={340}
              style={{ position: 'absolute', bottom: 34 * stageScale, left: 52 * stageScale }}
            />
          </>
        ) : null}
      </View>

      <Animated.View
        style={[
          styles.wordsWrap,
          {
            opacity: words,
            transform: [{ translateY: words.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        <Text accessibilityRole="header" style={styles.sealed}>Sealed for later.</Text>
        <Text style={styles.sealedSub}>Night {nightIndex} is tucked away.</Text>
        {ceremonyComplete && screenReaderEnabled ? (
          <View style={styles.accessibleContinue}>
            <Button onPress={onDone} accessibilityLabel="Continue to the night reward">Continue</Button>
          </View>
        ) : null}
      </Animated.View>
    </Screen>
  );
}

export type GeneratingStep = { label: string; state: 'done' | 'active' | 'skipped'; detail?: string };

/**
 * The waiting room after a checkpoint night.
 *
 * The steps are supplied by the caller from real application state. The
 * previous version completed three hard-coded steps on 900ms timers, which
 * meant it cheerfully reported "Checking private backup ✓" to users who had no
 * account, no consent, or no Wi-Fi — the one thing this product promises never
 * to do.
 */
export function GeneratingScreen({ mini = false, steps, onDone, onSetup, onRetry }: {
  mini?: boolean;
  steps: GeneratingStep[];
  onDone: () => void;
  onSetup?: () => void;
  onRetry?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 2400, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
      Animated.timing(pulse, { toValue: 0, duration: 2400, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, reducedMotion]);

  return (
    <Screen variant="night" contentStyle={styles.generatingCenter}>
      <Animated.View
        pointerEvents="none"
        style={{
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] }) }],
        }}
      >
        <Glow size={300} color={colors.rose} opacity={0.4} style={styles.generatingGlow} />
      </Animated.View>

      <Text accessibilityRole="header" style={styles.reading}>
        {mini ? 'Seven nights, gathered.' : 'Your chapter is gathered.'}
      </Text>
      <Text style={styles.generatingBody}>
        Your take is sealed on this device. A report is written only from recordings that are really backed up, and only with your processing consent.
      </Text>

      <View style={styles.steps}>
        {steps.map((step) => (
          <View key={step.label} style={styles.step}>
            <View style={[
              styles.check,
              step.state === 'done' && styles.checkComplete,
              step.state === 'skipped' && styles.checkSkipped,
            ]}>
              {step.state === 'done' ? <Check size={13} strokeWidth={3} color={colors.white} /> : null}
              {step.state === 'active' ? <View style={styles.checkActive} /> : null}
            </View>
            <View style={styles.stepCopy}>
              <Text style={[styles.stepText, step.state !== 'skipped' && styles.stepTextStrong]}>{step.label}</Text>
              {step.detail ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.generatingAction}>
        <Button onPress={onSetup ?? onDone}>{onSetup ? 'Finish reflection setup' : 'Continue'}</Button>
        {onRetry ? <Button variant="outline" onPress={onRetry}>Retry now</Button> : null}
        {onSetup ? <Button variant="ghost" onPress={onDone}>Keep this night on my phone for now</Button> : null}
        <Text style={styles.safeClose}>You can safely close the app. This checkpoint stays available from Home.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 24,
  },
  generatingCenter: {
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 28,
  },

  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  takeLines: {
    position: 'absolute',
    alignItems: 'center',
  },
  takeLine: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(190,111,124,0.34)',
  },
  envelope: {
    borderWidth: 1,
    borderColor: 'rgba(102,67,80,0.16)',
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 10,
  },
  envelopeSeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(102,67,80,0.10)',
  },
  flap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: 1,
    borderColor: 'rgba(102,67,80,0.12)',
    overflow: 'hidden',
    transformOrigin: 'top',
  },
  sealShadow: {
    // Opaque backing so the shadow has a shape to cast from, and an elevation
    // so Android renders one at all.
    backgroundColor: colors.rose,
    shadowColor: '#7A3244',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 16,
    elevation: 14,
    overflow: 'hidden',
  },
  sealImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.2 }],
  },
  gleam: {
    position: 'absolute',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  wordsWrap: {
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  sealed: {
    ...textStyles.title,
    color: night.text,
    fontSize: 36,
    lineHeight: 43,
    textAlign: 'center',
  },
  sealedSub: {
    ...textStyles.bodySmall,
    color: night.textDim,
    textAlign: 'center',
    maxWidth: 300,
  },
  accessibleContinue: {
    width: '100%',
    maxWidth: 300,
    marginTop: 14,
  },

  generatingGlow: {
    left: -150,
    top: -150,
  },
  reading: {
    ...textStyles.title,
    color: night.text,
    fontSize: 36,
    lineHeight: 43,
    textAlign: 'center',
  },
  generatingBody: {
    ...textStyles.bodySmall,
    color: night.textDim,
    textAlign: 'center',
    maxWidth: 330,
  },
  steps: {
    width: '100%',
    maxWidth: 340,
    marginTop: 12,
    gap: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: night.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkComplete: {
    backgroundColor: colors.roseDeep,
    borderColor: colors.roseDeep,
  },
  checkSkipped: {
    borderStyle: 'dashed',
    opacity: 0.6,
  },
  checkActive: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: night.candle,
  },
  stepCopy: {
    flex: 1,
  },
  stepText: {
    color: night.textFaint,
    fontFamily: typography.sans,
    fontWeight: weight.medium,
    fontSize: 14,
    lineHeight: 19,
  },
  stepTextStrong: {
    color: night.text,
  },
  stepDetail: {
    ...textStyles.caption,
    color: night.textFaint,
    marginTop: 2,
  },
  generatingAction: {
    width: '100%',
    maxWidth: 340,
    marginTop: 14,
    gap: 10,
  },
  safeClose: {
    ...textStyles.caption,
    color: night.textFaint,
    textAlign: 'center',
    marginTop: 2,
  },
});
