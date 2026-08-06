import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Platform, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { Button, TextButton } from '@/components/Buttons';
import { Screen } from '@/components/Screen';
import { Glow, Sparkle } from '@/components/Sparkle';
import { completedStickerAssets, isGildedNight, stickerAssetForNight } from '@/data/keepsakeAssets';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, motion, nativeAnimationDriver, night, textStyles, typography, weight } from '@/theme';

/** How long a plain night lingers before it hands you back to the app. Long
 *  enough to see the sticker land, short enough that night nineteen never feels
 *  like a door you have to open. */
const BRIEF_MS = 2600;

type Ceremony = {
  /** Full ceremonies wait to be dismissed; brief ones step aside on their own. */
  waits: boolean;
  eyebrow: string;
  title: string;
  body: string;
};

/**
 * The one moment the ritual has been saving up for: the sticker you just earned,
 * on a stage of its own.
 *
 * Deliberately not a "hooray". This app's voice is *Sealed for later* and *A
 * letter is on its way*; confetti would belong to a different product. It also
 * credits the act before the prize — you kept a night, and the sticker is the
 * receipt — so the app never becomes a thing you tap through to reach a reward.
 */
export function RewardScreen({ nightIndex, keptCount, targetLength, onDone, onShare }: {
  nightIndex: number;
  keptCount: number;
  targetLength: number;
  onDone: () => void;
  onShare: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const stickerIn = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const [landed, setLanded] = useState(false);

  const gilded = isGildedNight(nightIndex);
  const art = stickerAssetForNight(completedStickerAssets, nightIndex);
  const ceremony = ceremonyFor(nightIndex, keptCount, targetLength, gilded);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${ceremony.title} ${ceremony.body}`);
  }, [ceremony.body, ceremony.title]);

  useEffect(() => {
    if (reducedMotion) {
      stickerIn.setValue(1);
      words.setValue(1);
      setLanded(true);
      if (ceremony.waits) return;
      const timer = setTimeout(onDone, BRIEF_MS);
      return () => clearTimeout(timer);
    }

    const arrival = Animated.sequence([
      Animated.spring(stickerIn, { toValue: 1, damping: 10, stiffness: 130, mass: 0.8, useNativeDriver: nativeAnimationDriver }),
      Animated.timing(words, { toValue: 1, duration: 420, easing: motion.easeSoft, useNativeDriver: nativeAnimationDriver }),
    ]);

    const land = setTimeout(() => {
      setLanded(true);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      }
    }, 260);

    arrival.start();

    // A brief night steps aside on its own; a first night or a milestone waits
    // to be dismissed, because those are the ones worth sitting with.
    const leave = ceremony.waits ? undefined : setTimeout(onDone, BRIEF_MS);
    return () => {
      clearTimeout(land);
      if (leave) clearTimeout(leave);
      arrival.stop();
    };
  }, [ceremony.waits, onDone, reducedMotion, stickerIn, words]);

  return (
    <Screen scroll={false} variant="night" contentStyle={styles.screen}>
      <View style={styles.stage}>
        <Animated.View
          style={{
            opacity: stickerIn.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 1] }),
            transform: [
              { scale: stickerIn.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.3, 1.12, 1] }) },
              { rotate: stickerIn.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', `${((nightIndex % 5) - 2) * 1.4}deg`] }) },
            ],
          }}
        >
          <Glow
            size={280}
            color={gilded ? night.candle : colors.rose}
            opacity={gilded ? 0.55 : 0.4}
            style={styles.glow}
          />
          <Image source={art} resizeMode="contain" accessibilityElementsHidden style={styles.sticker} />
        </Animated.View>

        {landed ? (
          <>
            <Sparkle size={13} color={night.candle} twinkle style={styles.sparkleOne} />
            <Sparkle size={10} color={colors.rose} twinkle delay={340} style={styles.sparkleTwo} />
            <Sparkle size={9} color={night.candle} twinkle delay={560} style={styles.sparkleThree} />
            {gilded ? <Sparkle size={15} color={night.candle} twinkle delay={820} style={styles.sparkleGilded} /> : null}
          </>
        ) : null}
      </View>

      <Animated.View
        style={[
          styles.words,
          {
            opacity: words,
            transform: [{ translateY: words.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        <Text style={styles.eyebrow}>{ceremony.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>{ceremony.title}</Text>
        <Text style={styles.body}>{ceremony.body}</Text>

        {/* Offered, never pushed. A sticker carries no part of what was said, so
            it is the one thing in this app that is safe to show anyone — but a
            keepsake that nags you to post it is not a keepsake. */}
        {ceremony.waits ? (
          <View style={styles.actions}>
            <Button onPress={onDone} variant="bone" accessibilityLabel="Continue">Keep going</Button>
            <TextButton onPress={onShare} color={night.candle} accessibilityLabel="Share this night">
              Share this night
            </TextButton>
          </View>
        ) : null}
      </Animated.View>
    </Screen>
  );
}

/**
 * Three registers, so the thirtieth night does not get the same fanfare as the
 * first — and so the twelfth does not get fanfare at all.
 */
function ceremonyFor(nightIndex: number, keptCount: number, targetLength: number, gilded: boolean): Ceremony {
  if (keptCount <= 1) {
    return {
      waits: true,
      eyebrow: 'YOUR FIRST NIGHT',
      title: 'You kept night one.',
      body: `This sticker is yours now. One arrives for every night you answer, and ${targetLength} of them make a chapter.`,
    };
  }
  if (keptCount >= targetLength) {
    return {
      waits: true,
      eyebrow: 'CHAPTER COMPLETE',
      title: 'You kept every night.',
      body: `${targetLength} nights, in your own voice. The sheet is full.`,
    };
  }
  if (keptCount % 7 === 0) {
    return {
      waits: true,
      eyebrow: 'A CHECKPOINT',
      title: `${keptCount} nights kept.`,
      body: 'Your sheet is filling up. Something to look back on already.',
    };
  }
  if (gilded) {
    return {
      waits: false,
      eyebrow: 'A GILDED NIGHT',
      title: `You kept night ${nightIndex}.`,
      body: 'This one came out gilded — the rare kind.',
    };
  }
  return {
    waits: false,
    eyebrow: 'TONIGHT',
    title: `You kept night ${nightIndex}.`,
    body: `${keptCount} of ${targetLength} nights, safe.`,
  };
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 8,
  },
  stage: {
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    alignSelf: 'center',
  },
  sticker: {
    width: 168,
    height: 168,
  },
  words: {
    alignItems: 'center',
    gap: 6,
    maxWidth: 340,
  },
  eyebrow: {
    ...textStyles.eyebrow,
    color: night.candle,
    fontSize: 10,
    letterSpacing: 2,
  },
  title: {
    color: colors.white,
    fontFamily: typography.serifSemiBold,
    fontSize: 27,
    lineHeight: 34,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  body: {
    color: 'rgba(246,231,222,0.76)',
    fontFamily: typography.sans,
    fontWeight: weight.medium,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  actions: {
    alignItems: 'center',
    gap: 4,
    marginTop: 18,
    alignSelf: 'stretch',
  },
  sparkleOne: { position: 'absolute', top: 44, right: 52 },
  sparkleTwo: { position: 'absolute', bottom: 66, left: 44 },
  sparkleThree: { position: 'absolute', top: 74, left: 66 },
  sparkleGilded: { position: 'absolute', bottom: 48, right: 66 },
});
