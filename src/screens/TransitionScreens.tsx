import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Platform, StyleSheet, Text, View } from 'react-native';
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
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`Night ${nightIndex} is sealed.`);
  }, [nightIndex]);

  useEffect(() => {
    if (reducedMotion) {
      [fold, flap, drop, impact, light, words].forEach((value) => value.setValue(1));
      setPressed(true);
      // Reduced motion removes motion, not the confirmation — hold long enough
      // for the words to actually be read.
      const timer = setTimeout(onDone, 1500);
      return () => clearTimeout(timer);
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
      if (finished) setTimeout(onDone, 620);
    });

    return () => {
      clearTimeout(contact);
      sequence.stop();
    };
  }, [drop, flap, fold, impact, light, nightIndex, onDone, reducedMotion, words]);

  return (
    <Screen scroll={false} variant="night" contentStyle={styles.center}>
      <View style={styles.stage}>
        {/* The take, folding inward and fading under the flap. */}
        <Animated.View
          style={[
            styles.takeLines,
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

        <View style={styles.envelope}>
          <LinearGradient colors={['#FFFCF7', '#F6E7DF']} style={StyleSheet.absoluteFill} />
          <View style={styles.envelopeSeam} />
          {/* The flap folds shut over the take. */}
          <Animated.View
            style={[
              styles.flap,
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
          <Glow size={190} color={colors.brass} opacity={0.85} style={styles.glowCentre} />
        </Animated.View>

        {/* The seal. Absolutely fills the stage and is centred within it, so its
            resting position is the envelope's centre on any screen. */}
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: drop.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.55, 1] }),
              transform: [
                { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-150, 0] }) },
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
            <View style={styles.sealShadow}>
              <Image source={keepsakeDecorations.waxSeal} resizeMode="contain" style={styles.sealImage} />
              {/* A single shimmer travelling across the wax once it has set. */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.gleam,
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
            <Sparkle size={13} color={night.candle} twinkle style={styles.sparkleOne} />
            <Sparkle size={10} color={colors.rose} twinkle delay={340} style={styles.sparkleTwo} />
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
export function GeneratingScreen({ mini = false, steps, onDone }: {
  mini?: boolean;
  steps: GeneratingStep[];
  onDone: () => void;
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
    <Screen scroll={false} variant="night" contentStyle={styles.center}>
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
        <Button onPress={onDone}>Continue</Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },

  stage: {
    width: STAGE,
    height: 240,
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
  glowCentre: {
    left: (STAGE - 190) / 2,
    top: (240 - 190) / 2,
  },
  takeLines: {
    position: 'absolute',
    width: ENVELOPE_W - 92,
    alignItems: 'center',
    gap: 9,
  },
  takeLine: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(190,111,124,0.34)',
  },
  envelope: {
    width: ENVELOPE_W,
    height: ENVELOPE_H,
    borderRadius: radii.md,
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
    top: ENVELOPE_H / 2,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(102,67,80,0.10)',
  },
  flap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ENVELOPE_H * 0.62,
    borderBottomLeftRadius: 120,
    borderBottomRightRadius: 120,
    borderBottomWidth: 1,
    borderColor: 'rgba(102,67,80,0.12)',
    overflow: 'hidden',
    transformOrigin: 'top',
  },
  sealShadow: {
    width: SEAL,
    height: SEAL,
    borderRadius: SEAL / 2,
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
    top: SEAL * 0.18,
    left: SEAL * 0.2,
    width: 16,
    height: SEAL * 0.7,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  sparkleOne: { position: 'absolute', top: 26, right: 42 },
  sparkleTwo: { position: 'absolute', bottom: 34, left: 52 },

  wordsWrap: {
    alignItems: 'center',
    gap: 6,
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
  },
});
