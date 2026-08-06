import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Play } from 'lucide-react-native';

import { Glow } from '@/components/Sparkle';
import { completedStickerAssets, embossedStickerAssets, keepsakeDecorations, mysteryEmboss, stickerAssetForNight } from '@/data/keepsakeAssets';
import { formatDuration, formatLongDate } from '@/domain/format';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, gradients, motion, nativeAnimationDriver, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import type { Night } from '@/types';

const GAP = 12;

/** Every fixed part of a card's height, so the art can be sized to whatever is
 *  left rather than pushing the caption out through the bottom edge. */
const CARD_PAD_TOP = 14;
const CARD_PAD_BOTTOM = 16;
/** Breathing room the mount adds around the art it holds. */
const MOUNT_INSET = 22;
const SPINE_GAP = 16;
const SPINE_HEIGHT = 8;

/** Rule + plate number + state + detail line, at each density. Kept in step
 *  with the caption styles below; the card's height is derived from it. */
const CAPTION_HEIGHT = { dense: 74, compact: 78, normal: 82 } as const;

/** 'YYYY-MM-DD' in the user's own calendar. Parsed by parts rather than by
 *  `new Date(key)`, which would read it as UTC and slide a day backwards for
 *  anyone west of Greenwich. */
function readDateKey(key: string) {
  const [year = 1970, month = 1, day = 1] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

type CardState = {
  /** The night's real motif, or the blind disc every unearned night wears. */
  art: ReturnType<typeof stickerAssetForNight>;
  faded: boolean;
  tilted: boolean;
  eyebrow: string;
  line: string;
  /** The line is a duration rather than a date, so it sets in the mono face. */
  numeric?: boolean;
};

/**
 * Tonight, its neighbours, and the whole chapter behind them — laid out as a
 * filmstrip rather than a sheet of thirty windows.
 *
 * The board showed every night at once, which meant every sticker was drawn at
 * roughly 45px and none of the artwork could be read. Here one card holds the
 * screen, so the art, the wax and the emboss are all legible, and the reveal of
 * a newly earned sticker has somewhere to happen.
 */
export function NightStrip({ nights, canRecord, newlyEarned, onPressNight, onRecord, compact = false, dense = false, maxHeight }: {
  nights: Night[];
  canRecord: boolean;
  newlyEarned?: number;
  onPressNight: (night: Night) => void;
  onRecord: () => void;
  compact?: boolean;
  dense?: boolean;
  /** The height the strip has been given. Cards are sized to fit inside it —
   *  without this the horizontal ScrollView (which ships `flexShrink: 1`)
   *  quietly squashed every card and the clipped caption ran into the border. */
  maxHeight?: number;
}) {
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const cardWidth = Math.round(Math.min(250, Math.max(172, width * 0.62)));
  const captionHeight = dense ? CAPTION_HEIGHT.dense : compact ? CAPTION_HEIGHT.compact : CAPTION_HEIGHT.normal;
  const chrome = CARD_PAD_TOP + MOUNT_INSET + captionHeight + CARD_PAD_BOTTOM;

  // Art is the first thing to give when the screen is short, and the caption
  // never is: a half-cut "14s" reads as a rendering fault, small artwork reads
  // as a small card.
  const artFromWidth = cardWidth * (dense ? 0.5 : compact ? 0.56 : 0.6);
  const artFromHeight = maxHeight ? maxHeight - SPINE_GAP - SPINE_HEIGHT - chrome : Number.POSITIVE_INFINITY;
  const artSize = Math.round(Math.max(76, Math.min(artFromWidth, artFromHeight)));
  const cardHeight = chrome + artSize;
  const step = cardWidth + GAP;

  // The strip opens on the night that matters: tonight, or the last one kept if
  // the chapter is already behind you.
  const anchor = useMemo(() => {
    const today = nights.findIndex((night) => night.status === 'today');
    if (today >= 0) return today;
    const lastKept = nights.map((night) => night.status).lastIndexOf('sealed');
    const lastRevealed = nights.map((night) => night.status).lastIndexOf('revealed');
    return Math.max(0, lastKept, lastRevealed);
  }, [nights]);

  const todayIndex = nights.findIndex((night) => night.status === 'today');

  // Land on the anchor once the strip knows how wide a card is, then again
  // whenever a night is freshly earned — coming back from sealing should carry
  // you to the sticker you just won.
  useEffect(() => {
    if (!step || width <= 0) return;
    const earnedAt = newlyEarned ? nights.findIndex((night) => night.index === newlyEarned) : -1;
    const target = earnedAt >= 0 ? earnedAt : anchor;
    const scroll = () => scroller.current?.scrollTo({ x: target * step, animated: earnedAt >= 0 && !reducedMotion });
    // A frame's grace so the ScrollView has its content laid out to scroll to.
    const timer = setTimeout(scroll, 16);
    return () => clearTimeout(timer);
  }, [anchor, newlyEarned, nights, reducedMotion, step, width]);

  const measure = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (Math.abs(next - width) > 1) setWidth(next);
  };

  return (
    <View style={styles.strip} onLayout={measure}>
      {width > 0 ? (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          decelerationRate="fast"
          disableIntervalMomentum
          style={styles.rail}
          // `alignItems: center` rather than the default stretch: a card keeps
          // the height it asked for instead of being pulled to the rail's.
          contentContainerStyle={{ paddingHorizontal: (width - cardWidth) / 2, gap: GAP, alignItems: 'center' }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: nativeAnimationDriver,
          })}
          scrollEventThrottle={16}
        >
          {nights.map((night, index) => (
            <NightCard
              key={night.id}
              night={night}
              width={cardWidth}
              height={cardHeight}
              artSize={artSize}
              compact={compact}
              dense={dense}
              // The first night still ahead of you is tomorrow: the only future
              // card that wears wax, so there is exactly one thing to wonder
              // about rather than a row of them.
              isTomorrow={todayIndex >= 0 && index === todayIndex + 1}
              isNew={night.index === newlyEarned}
              canRecord={canRecord}
              reducedMotion={reducedMotion}
              offset={scrollX.interpolate({
                inputRange: [(index - 1) * step, index * step, (index + 1) * step],
                outputRange: [0, 1, 0],
                extrapolate: 'clamp',
              })}
              onPress={() => (night.status === 'today' && canRecord ? onRecord() : onPressNight(night))}
            />
          ))}
        </ScrollView>
      ) : null}

      <Spine nights={nights} />
    </View>
  );
}

function cardState(night: Night, isTomorrow: boolean): CardState {
  const date = readDateKey(night.expectedLocalDate);
  switch (night.status) {
    case 'revealed':
      return {
        art: stickerAssetForNight(completedStickerAssets, night.index),
        faded: false,
        tilted: true,
        eyebrow: 'Yours to hear',
        line: night.durationSec ? formatDuration(night.durationSec) : 'Recorded',
      };
    case 'sealed':
      return {
        art: stickerAssetForNight(completedStickerAssets, night.index),
        faded: false,
        tilted: true,
        eyebrow: 'Sealed',
        line: night.durationSec ? formatDuration(night.durationSec) : 'Kept',
        numeric: Boolean(night.durationSec),
      };
    case 'missed':
      // The one case that shows its true motif unearned — you may see what the
      // empty night would have held. Faded, never marked in red.
      return {
        art: stickerAssetForNight(embossedStickerAssets, night.index),
        faded: true,
        tilted: false,
        eyebrow: 'Stayed empty',
        line: formatLongDate(date),
      };
    case 'today':
      return { art: mysteryEmboss, faded: false, tilted: false, eyebrow: 'Tonight', line: formatLongDate(date) };
    default:
      return {
        art: mysteryEmboss,
        faded: false,
        tilted: false,
        eyebrow: isTomorrow ? 'Tomorrow' : 'Not yet',
        line: formatLongDate(date),
      };
  }
}

/** Gilt photo corners, the way a night is mounted in a keepsake album. The
 *  bottom-right one steps aside for the wax, which occupies that corner. */
function MountCorners({ tone, waxed }: { tone: string; waxed: boolean }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.corner, styles.cornerTopLeft, { borderColor: tone }]} />
      <View style={[styles.corner, styles.cornerTopRight, { borderColor: tone }]} />
      <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: tone }]} />
      {waxed ? null : <View style={[styles.corner, styles.cornerBottomRight, { borderColor: tone }]} />}
    </View>
  );
}

function NightCard({ night, width, height, artSize, compact, dense, isTomorrow, isNew, canRecord, reducedMotion, offset, onPress }: {
  night: Night;
  width: number;
  height: number;
  artSize: number;
  compact: boolean;
  dense: boolean;
  isTomorrow: boolean;
  isNew: boolean;
  canRecord: boolean;
  reducedMotion: boolean;
  offset: Animated.AnimatedInterpolation<number>;
  onPress: () => void;
}) {
  const state = cardState(night, isTomorrow);
  const isToday = night.status === 'today';
  const completed = night.status === 'sealed' || night.status === 'revealed';
  const breathe = useRef(new Animated.Value(0)).current;
  const settle = useRef(new Animated.Value(1)).current;

  // Slow breathing candlelight on tonight's card only (§11.2 "Current-night
  // glow"): 4.4s round trip. Nothing else on the strip moves on its own — a
  // keepsake, not a loading screen.
  useEffect(() => {
    if (!isToday || reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 2200, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
      Animated.timing(breathe, { toValue: 0, duration: 2200, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [breathe, isToday, reducedMotion]);

  // An echo, not the payoff. The reveal happens on its own screen now; a second
  // celebration here would only deflate the first, so the newly earned sticker
  // simply settles into place rather than performing again.
  useEffect(() => {
    if (!isNew || reducedMotion) {
      settle.setValue(1);
      return;
    }
    settle.setValue(0);
    const animation = Animated.spring(settle, {
      toValue: 1,
      damping: 11,
      stiffness: 150,
      mass: 0.7,
      useNativeDriver: nativeAnimationDriver,
    });
    animation.start();
    return () => animation.stop();
  }, [isNew, reducedMotion, settle]);

  const label = isToday
    ? `Night ${night.index}, tonight${canRecord ? ', ready to record' : ''}`
    : completed
      ? `Night ${night.index}, ${night.status === 'revealed' ? 'revealed, playable' : 'recorded and sealed'}`
      : night.status === 'missed'
        ? `Night ${night.index}, stayed empty`
        : `Night ${night.index}, ${isTomorrow ? 'tomorrow' : 'not yet'}`;

  return (
    <Animated.View
      style={{
        opacity: reducedMotion ? 1 : offset.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
        transform: [{ scale: reducedMotion ? 1 : offset.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          // `minHeight`, not `height`: the card is guaranteed the room its
          // caption needs, and can still grow past it under a large system font
          // rather than clipping the line off against its own border.
          { width, minHeight: height },
          isToday && styles.cardToday,
          night.status === 'missed' && styles.cardMissed,
          night.status === 'revealed' && styles.cardRevealed,
          pressed && styles.cardPressed,
        ]}
      >
        <LinearGradient colors={gradients.cardSheen} style={styles.cardSheen} pointerEvents="none" />

        <View style={[styles.well, { height: artSize + MOUNT_INSET }]}>
          {/* Letterpress: the well is pressed into the card rather than sitting
              on it, so the art reads as mounted paper. */}
          <LinearGradient
            colors={['rgba(102,67,80,0.09)', 'rgba(102,67,80,0)']}
            style={styles.wellPress}
            pointerEvents="none"
          />

          {night.status === 'missed' ? null : (
            <MountCorners
              waxed={night.status === 'sealed' || isTomorrow}
              tone={isToday ? 'rgba(184,134,53,0.5)' : completed ? 'rgba(190,111,124,0.34)' : 'rgba(102,67,80,0.16)'}
            />
          )}

          {isToday && !reducedMotion ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.glowLayer,
                {
                  opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
                  transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] }) }],
                },
              ]}
            >
              <Glow size={artSize * 1.7} color={colors.rose} opacity={0.6} style={styles.glowInline} />
            </Animated.View>
          ) : null}

          <Animated.View
            style={{
              opacity: settle,
              transform: [
                { scale: settle.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.7, 1.06, 1] }) },
                { rotate: state.tilted ? `${((night.index % 5) - 2) * 0.7}deg` : '0deg' },
              ],
            }}
          >
            <Image
              source={state.art}
              resizeMode="contain"
              accessibilityElementsHidden
              style={[{ width: artSize, height: artSize }, state.faded && styles.fadedArt]}
            />
          </Animated.View>

          {/* Wax marks the two nights that are actually sealed shut: the one you
              recorded, and the one you cannot open yet. */}
          {night.status === 'sealed' || isTomorrow ? (
            <Image
              source={keepsakeDecorations.waxSeal}
              resizeMode="contain"
              accessibilityElementsHidden
              style={[styles.wax, { width: artSize * 0.3, height: artSize * 0.3 }]}
            />
          ) : null}

        </View>

        {/* A mounted plate, not a list row: a hairline rule, the night's number
            struck small in gilt, then what became of it. */}
        <View style={styles.plateRule} />
        <Text style={[styles.number, isToday && styles.numberToday]}>NIGHT {night.index}</Text>
        <Text
          numberOfLines={1}
          style={[styles.eyebrow, compact && styles.compactEyebrow, dense && styles.denseEyebrow, isToday && styles.eyebrowToday]}
        >
          {state.eyebrow}
        </Text>

        {isToday && canRecord ? (
          <View style={styles.ctaRow}>
            <Text style={styles.cta}>Open tonight’s letter</Text>
            <ChevronRight size={13} strokeWidth={2.4} color={colors.roseText} />
          </View>
        ) : night.status === 'revealed' ? (
          <View style={styles.ctaRow}>
            <Play size={11} strokeWidth={2.4} color={colors.roseText} fill={colors.roseText} />
            <Text style={styles.cta}>{state.line}</Text>
          </View>
        ) : (
          <Text
            numberOfLines={1}
            // Durations wear the mono face the app uses for numbers everywhere
            // else; a written-out date stays in the reading face.
            style={[styles.line, state.numeric ? styles.numericLine : null, compact && styles.compactLine]}
          >
            {state.line}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** The whole chapter at a glance, so trading the board for a filmstrip does not
 *  cost the sense of a sheet slowly filling up. */
function Spine({ nights }: { nights: Night[] }) {
  // Past thirty, dots become a smear; the chapter reads better as one filled
  // rule.
  if (nights.length > 30) {
    const kept = nights.filter((night) => night.status === 'sealed' || night.status === 'revealed').length;
    return (
      <View accessibilityElementsHidden style={styles.spineBar}>
        <View style={[styles.spineFill, { flex: Math.max(0.001, kept) }]} />
        <View style={{ flex: Math.max(0.001, nights.length - kept) }} />
      </View>
    );
  }
  return (
    <View accessibilityElementsHidden style={styles.spine}>
      {nights.map((night) => (
        <View
          key={night.id}
          style={[
            styles.spineDot,
            (night.status === 'sealed' || night.status === 'revealed') && styles.spineDotKept,
            night.status === 'today' && styles.spineDotToday,
            night.status === 'missed' && styles.spineDotMissed,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    gap: SPINE_GAP,
  },
  // The rail must not shrink. A horizontal ScrollView ships `flexShrink: 1`,
  // so in a height-bounded slot it gave up whatever the layout was short of —
  // and the cards, clipped by their own `overflow: hidden`, lost their last
  // line to the border. Cards are sized to the slot instead.
  rail: {
    flexGrow: 0,
    flexShrink: 0,
  },
  card: {
    alignItems: 'center',
    paddingTop: CARD_PAD_TOP,
    paddingBottom: CARD_PAD_BOTTOM,
    paddingHorizontal: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    // A warm gilt rim, not a white one. Pure white edges on cream paper read as
    // a UI card floating over the page rather than a plate lying on it.
    borderColor: 'rgba(184,134,53,0.2)',
    backgroundColor: surfaces.card,
    overflow: 'hidden',
    ...shadows.soft,
  },
  cardToday: {
    borderColor: 'rgba(184,134,53,0.46)',
    ...shadows.floating,
  },
  cardRevealed: {
    borderColor: 'rgba(190,111,124,0.3)',
  },
  /** Dashed and flat: an empty night recedes rather than accuses. */
  cardMissed: {
    backgroundColor: surfaces.cardSoft,
    borderColor: colors.line,
    borderStyle: 'dashed',
    shadowOpacity: 0.04,
    elevation: 1,
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.94,
  },
  cardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  // The mount the night is pressed into: warm album paper rather than the grey
  // inner box it was, so the card reads as one material with the page.
  well: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: surfaces.paper,
    borderWidth: 1,
    borderColor: 'rgba(102,67,80,0.09)',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 11,
    height: 11,
  },
  cornerTopLeft: { top: 6, left: 6, borderTopWidth: 1, borderLeftWidth: 1, borderTopLeftRadius: 3 },
  cornerTopRight: { top: 6, right: 6, borderTopWidth: 1, borderRightWidth: 1, borderTopRightRadius: 3 },
  cornerBottomLeft: { bottom: 6, left: 6, borderBottomWidth: 1, borderLeftWidth: 1, borderBottomLeftRadius: 3 },
  cornerBottomRight: { bottom: 6, right: 6, borderBottomWidth: 1, borderRightWidth: 1, borderBottomRightRadius: 3 },
  wellPress: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 14,
  },
  glowLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowInline: {
    position: 'relative',
  },
  fadedArt: {
    opacity: 0.42,
  },
  wax: {
    position: 'absolute',
    right: 10,
    bottom: 8,
  },
  /** Every caption line carries an explicit line height: the card's height is
   *  computed from `CAPTION_HEIGHT`, and that arithmetic has to be true. */
  plateRule: {
    width: 20,
    height: 1,
    backgroundColor: 'rgba(184,134,53,0.34)',
    marginTop: 9,
    marginBottom: 8,
  },
  number: {
    ...textStyles.eyebrow,
    color: colors.brassText,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.9,
  },
  numberToday: {
    color: colors.roseText,
  },
  eyebrow: {
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 17,
    lineHeight: 22,
    marginTop: 2,
  },
  compactEyebrow: {
    fontSize: 15,
    lineHeight: 20,
  },
  denseEyebrow: {
    fontSize: 14,
    lineHeight: 18,
  },
  eyebrowToday: {
    color: colors.roseText,
  },
  line: {
    color: colors.paperDim,
    fontFamily: typography.sans,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },
  numericLine: {
    fontFamily: typography.mono,
    fontSize: 11.5,
    letterSpacing: 0.3,
  },
  compactLine: {
    fontSize: 11,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
    height: 17,
  },
  cta: {
    color: colors.roseText,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 12.5,
    lineHeight: 17,
  },
  spine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  spineDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(102,67,80,0.16)',
  },
  spineDotKept: {
    backgroundColor: colors.rose,
  },
  spineDotToday: {
    backgroundColor: colors.brass,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  spineDotMissed: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(102,67,80,0.22)',
  },
  spineBar: {
    flexDirection: 'row',
    height: 3,
    marginHorizontal: 24,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(102,67,80,0.12)',
  },
  spineFill: {
    backgroundColor: colors.rose,
  },
});
