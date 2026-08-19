import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, {
  Circle,
  Defs,
  Image as SvgImage,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

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
  onShare: (imageBase64: string) => void | Promise<void>;
}) {
  const reducedMotion = useReducedMotion();
  const screenReaderEnabled = useScreenReaderEnabled();
  const { width, height, fontScale } = useWindowDimensions();
  const stickerIn = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const shareCard = useRef<Svg>(null);
  const [landed, setLanded] = useState(false);
  const [sharing, setSharing] = useState(false);

  const gilded = isGildedNight(nightIndex);
  const art = stickerAssetForNight(completedStickerAssets, nightIndex);
  const ceremony = ceremonyFor(nightIndex, keptCount, targetLength, gilded);
  const stageSize = Math.max(180, Math.min(
    280,
    width - 56,
    height * (fontScale > 1.2 ? 0.32 : 0.44),
  ));
  const stickerSize = stageSize * 0.6;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${ceremony.title} ${ceremony.body}`);
  }, [ceremony.body, ceremony.title]);

  useEffect(() => {
    if (reducedMotion) {
      stickerIn.setValue(1);
      words.setValue(1);
      setLanded(true);
      return;
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

    return () => {
      clearTimeout(land);
      arrival.stop();
    };
  }, [reducedMotion, stickerIn, words]);

  useEffect(() => {
    // A brief night still steps aside after the original 2.6 seconds, except
    // while a screen reader is active. `null` holds the screen until the async
    // platform check resolves instead of guessing that accessibility is off.
    if (ceremony.waits || screenReaderEnabled !== false) return;
    const leave = setTimeout(onDone, BRIEF_MS);
    return () => clearTimeout(leave);
  }, [ceremony.waits, onDone, screenReaderEnabled]);

  const waitsForPerson = ceremony.waits || screenReaderEnabled === true;

  const shareImage = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const svg = shareCard.current;
        if (!svg) {
          reject(new Error('The share image is still being prepared. Try again.'));
          return;
        }
        const timeout = setTimeout(() => reject(new Error('The share image took too long to prepare. Try again.')), 5000);
        svg.toDataURL((value) => {
          clearTimeout(timeout);
          if (value) resolve(value);
          else reject(new Error('The share image could not be created.'));
        }, { width: 1080, height: 1350 });
      });
      await onShare(base64);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen variant="night" contentStyle={styles.screen}>
      {/* Kept mounted at a real size so react-native-svg can rasterize a crisp
          4:5 share image. It is laid out well outside the viewport rather than
          using opacity: 0, because Android includes the root view's opacity
          when toDataURL captures it. */}
      <Svg
        ref={shareCard}
        width={360}
        height={450}
        viewBox="0 0 1080 1350"
        pointerEvents="none"
        accessibilityElementsHidden
        style={styles.shareCardRenderer}
      >
        <Defs>
          <SvgLinearGradient id="share-background" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#4A2737" />
            <Stop offset="0.56" stopColor="#2E1721" />
            <Stop offset="1" stopColor="#1F0E17" />
          </SvgLinearGradient>
          <SvgLinearGradient id="share-halo" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#E4C27A" stopOpacity="0.34" />
            <Stop offset="1" stopColor="#BE6F7C" stopOpacity="0.08" />
          </SvgLinearGradient>
        </Defs>
        <Rect width="1080" height="1350" fill="url(#share-background)" />
        <Circle cx="540" cy="470" r="310" fill="url(#share-halo)" />
        <Circle cx="540" cy="470" r="244" fill="#3B2030" stroke="#E4C27A" strokeWidth="3" opacity="0.88" />
        <SvgImage href={art} x="310" y="240" width="460" height="460" preserveAspectRatio="xMidYMid meet" />
        <SvgText x="540" y="790" fill="#E4C27A" fontFamily="sans-serif" fontWeight="600" fontSize="30" letterSpacing="7" textAnchor="middle">
          {`NIGHT ${nightIndex}  /  KEPT`}
        </SvgText>
        <SvgText x="540" y="890" fill="#FFFDF9" fontFamily={typography.serifSemiBold} fontSize="64" textAnchor="middle">
          I showed up tonight.
        </SvgText>
        <SvgText x="540" y="956" fill="#D9B9B9" fontFamily={typography.sans} fontSize="31" textAnchor="middle">
          One quiet question. One night kept.
        </SvgText>
        <Rect x="390" y="1060" width="300" height="2" fill="#E4C27A" opacity="0.48" />
        <SvgText x="540" y="1150" fill="#FFFDF9" fontFamily={typography.monoMedium} fontSize="34" letterSpacing="10" textAnchor="middle">
          THIRTY NIGHTS
        </SvgText>
        <SvgText x="540" y="1205" fill="#D9B9B9" fontFamily={typography.sans} fontSize="27" textAnchor="middle">
          One question a night.
        </SvgText>
      </Svg>

      <View style={[styles.stage, { width: stageSize, height: stageSize }]}>
        <Animated.View
          style={[styles.stickerStage, {
            width: stageSize,
            height: stageSize,
            opacity: stickerIn.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 1] }),
            transform: [
              { scale: stickerIn.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.3, 1.12, 1] }) },
              { rotate: stickerIn.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', `${((nightIndex % 5) - 2) * 1.4}deg`] }) },
            ],
          }]}
        >
          <Glow
            size={stageSize}
            color={gilded ? night.candle : colors.rose}
            opacity={gilded ? 0.55 : 0.4}
            style={styles.glow}
          />
          <Image
            source={art}
            resizeMode="contain"
            accessibilityElementsHidden
            style={{ width: stickerSize, height: stickerSize }}
          />
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
        {waitsForPerson ? (
          <View style={styles.actions}>
            <Button onPress={onDone} variant="bone" accessibilityLabel="Continue">
              {ceremony.waits ? 'Keep going' : 'Continue'}
            </Button>
            {ceremony.waits ? (
              <TextButton onPress={() => { if (!sharing) void shareImage(); }} color={night.candle} accessibilityLabel="Share this night as an image">
                {sharing ? 'Preparing image…' : 'Share this night'}
              </TextButton>
            ) : null}
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
  // A local trial chapter currently reports a target of seven, but seven is a
  // checkpoint in the Thirty Nights journey — never a completed chapter. Use
  // the paid target once it is larger, while keeping trial progress pointed at
  // the real night-30 destination.
  const journeyLength = targetLength === 7 ? 30 : targetLength;

  if (keptCount <= 1) {
    return {
      waits: true,
      eyebrow: 'YOUR FIRST NIGHT',
      title: 'You kept your first night.',
      body: 'A sticker arrives for every night you keep. Your first seven are included.',
    };
  }
  if (nightIndex === 7) {
    return {
      waits: true,
      eyebrow: 'YOUR FIRST REFLECTION',
      title: 'Your first seven nights.',
      body: `${keptCount} ${keptCount === 1 ? 'answer' : 'answers'} kept. Your first reflection comes next.`,
    };
  }
  if (targetLength > 7 && keptCount >= targetLength) {
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
      body: 'Your sheet is filling up.',
    };
  }
  if (gilded) {
    return {
      waits: false,
      eyebrow: 'A GILDED NIGHT',
      title: `You kept night ${nightIndex}.`,
      body: 'A rare gilded sticker.',
    };
  }
  return {
    waits: false,
    eyebrow: 'TONIGHT',
    title: `You kept night ${nightIndex}.`,
    body: `${keptCount} of ${journeyLength} nights, safe.`,
  };
}

const styles = StyleSheet.create({
  screen: {
    minHeight: '100%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 22,
    gap: 8,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerStage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  shareCardRenderer: {
    position: 'absolute',
    top: -10000,
    left: -10000,
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
  sparkleOne: { position: 'absolute', top: '16%', right: '19%' },
  sparkleTwo: { position: 'absolute', bottom: '24%', left: '16%' },
  sparkleThree: { position: 'absolute', top: '26%', left: '24%' },
  sparkleGilded: { position: 'absolute', bottom: '17%', right: '24%' },
});
