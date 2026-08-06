import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

/** A missed night is marked, not left blank — two soft strokes, like a pencil
 *  cross on a page. Legible at a glance without shouting. */
function MissedMark({ size }: { size: number }) {
  const inset = size * 0.3;
  const far = size - inset;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={size} height={size}>
        <Line x1={inset} y1={inset} x2={far} y2={far} stroke={colors.roseText} strokeWidth={1.8} strokeLinecap="round" strokeOpacity={0.55} />
        <Line x1={far} y1={inset} x2={inset} y2={far} stroke={colors.roseText} strokeWidth={1.8} strokeLinecap="round" strokeOpacity={0.55} />
      </Svg>
    </View>
  );
}

import { completedStickerAssets, embossedStickerAssets, isGildedNight, mysteryEmboss, stickerAssetForNight } from '@/data/keepsakeAssets';
import { Glow, Sparkle } from '@/components/Sparkle';
import { colors, motion, nativeAnimationDriver, typography, weight } from '@/theme';
import type { Night } from '@/types';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type GridProps = {
  nights: Night[];
  onPressNight?: (night: Night) => void;
  revealed?: boolean;
  thumbnail?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  dense?: boolean;
  /** Pad out to a full 30-slot sheet. Off for short chapters so a 7-night
   *  trial does not render 23 empty slots that read as failures. */
  padToSheet?: boolean;
  /** Only this night plays the earn animation, instead of the whole board
   *  re-animating every time the screen mounts. */
  newlyEarned?: number;
};

const SIZE_CEILING = { thumbnail: 20, dense: 54, normal: 76, shortDense: 64, shortNormal: 100 } as const;

function gridMetrics(count: number, dense: boolean, thumbnail: boolean) {
  // A short (trial) chapter lays out four wide with markedly larger art, so it
  // reads as a real sticker sheet — not seven miniatures lost in a single row
  // across an otherwise empty board.
  const short = count <= 8;
  const columns = count <= 4 ? Math.max(1, count) : short ? 4 : 6;
  const columnGap = thumbnail ? 3 : dense ? 5 : short ? 10 : 8;
  const rowGap = thumbnail ? 3 : dense ? 4 : short ? 10 : 8;
  const labelSpace = thumbnail ? 0 : dense ? 13 : 18;
  const ceiling = thumbnail ? SIZE_CEILING.thumbnail
    : dense ? (short ? SIZE_CEILING.shortDense : SIZE_CEILING.dense)
      : short ? SIZE_CEILING.shortNormal : SIZE_CEILING.normal;
  return { columns, columnGap, rowGap, labelSpace, ceiling, rows: Math.max(1, Math.ceil(count / columns)) };
}

/**
 * The tallest this grid can ever be, derived from props alone.
 *
 * Callers use it to size a container *without* measuring the grid — feeding a
 * measured grid height back into the container that constrains the grid is an
 * infinite layout loop.
 */
export function estimateGridHeight({ count, dense = false, thumbnail = false, padToSheet = true }: {
  count: number;
  dense?: boolean;
  thumbnail?: boolean;
  padToSheet?: boolean;
}) {
  const effective = padToSheet ? Math.max(count, Math.min(30, count === 0 ? 30 : 30)) : count;
  const { rows, rowGap, labelSpace, ceiling } = gridMetrics(effective, dense, thumbnail);
  return rows * (ceiling + labelSpace) + (rows - 1) * rowGap;
}

/** Golden dust that puffs outward once when a sticker is earned (§11.2). */
function Dust({ size, reducedMotion }: { size: number; reducedMotion: boolean }) {
  const burst = useRef(new Animated.Value(0)).current;
  const motes = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const angle = (index / 7) * Math.PI * 2 + 0.4;
      return { x: Math.cos(angle), y: Math.sin(angle), scale: 0.5 + (index % 3) * 0.22 };
    }),
    [],
  );

  useEffect(() => {
    if (reducedMotion) return;
    const animation = Animated.timing(burst, {
      toValue: 1,
      duration: 900,
      delay: 220,
      easing: motion.easeGentle,
      useNativeDriver: nativeAnimationDriver,
    });
    animation.start();
    return () => animation.stop();
  }, [burst, reducedMotion]);

  if (reducedMotion) return null;

  return (
    <View pointerEvents="none" style={styles.dustLayer}>
      {motes.map((mote, index) => (
        <Animated.View
          key={index}
          style={[
            styles.mote,
            {
              opacity: burst.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.9, 0] }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, mote.x * size * 0.72] }) },
                { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, mote.y * size * 0.72] }) },
                { scale: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.2, mote.scale, 0.1] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

function Sticker({ night, size, onPress, thumbnail, reducedMotion, dense, isNew }: {
  night: Night;
  size: number;
  onPress?: () => void;
  thumbnail: boolean;
  reducedMotion: boolean;
  dense: boolean;
  isNew: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const breathe = useRef(new Animated.Value(0)).current;
  const settle = useRef(new Animated.Value(1)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  /** One light sweep across the sticker that has just been earned. */
  const sheen = useRef(new Animated.Value(0)).current;

  const completed = night.status === 'sealed' || night.status === 'revealed';
  const isToday = night.status === 'today';
  const missed = night.status === 'missed';
  const completedArt = stickerAssetForNight(completedStickerAssets, night.index);
  // Unearned nights keep their sticker a secret: every future slot (and
  // tonight's) wears the same blind emboss. Only a missed night shows its real
  // motif, faded — you may see what the empty night would have held.
  const embossedArt = missed ? stickerAssetForNight(embossedStickerAssets, night.index) : mysteryEmboss;
  const visualSize = size * (thumbnail ? 0.94 : 0.9);
  const labelSpace = thumbnail ? 0 : dense ? 13 : 18;
  const tilt = `${((night.index % 5) - 2) * 0.7}deg`;

  // Only a freshly earned sticker performs. Everything else is simply present —
  // the board should read as a keepsake, not as a loading screen.
  useEffect(() => {
    if (!isNew || reducedMotion) {
      settle.setValue(1);
      return;
    }
    settle.setValue(0);
    sheen.setValue(0);
    const animation = Animated.parallel([
      Animated.spring(settle, {
        toValue: 1,
        damping: 11,
        stiffness: 150,
        mass: 0.7,
        useNativeDriver: nativeAnimationDriver,
      }),
      Animated.timing(sheen, {
        toValue: 1,
        duration: 900,
        delay: 260,
        easing: motion.easeGentle,
        useNativeDriver: nativeAnimationDriver,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [isNew, reducedMotion, settle, sheen]);

  // Slow breathing glow, 4.4s round trip, 90%→100% (§11.2 "Current-night glow").
  useEffect(() => {
    if (!isToday || reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 2200, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
      Animated.timing(breathe, { toValue: 0, duration: 2200, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [breathe, isToday, reducedMotion]);

  const accessibilityLabel = completed
    ? `Night ${night.index}, ${night.status === 'revealed' ? 'revealed' : 'recorded and sealed'}`
    : isToday
      ? `Night ${night.index}, tonight, ready to record`
      : missed
        ? `Night ${night.index}, missed`
        : `Night ${night.index}, not yet`;

  const press = (toValue: number) => {
    if (reducedMotion || !onPress) return;
    Animated.spring(pressScale, { toValue, damping: 16, stiffness: 400, mass: 0.5, useNativeDriver: nativeAnimationDriver }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={!onPress}
      // Tap targets stay comfortable even when the art is small.
      hitSlop={onPress ? Math.max(0, Math.round((44 - size) / 2)) : undefined}
      onPressIn={() => press(0.9)}
      onPressOut={() => press(1)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.slot, { width: size, height: size + labelSpace }]}
    >
      {isToday && !thumbnail ? (
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
          <Glow size={size * 2} color={colors.rose} opacity={0.6} style={styles.glowInline} />
        </Animated.View>
      ) : null}

      {focused ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          style={[
            styles.focusRing,
            {
              width: visualSize + 8,
              height: visualSize + 8,
              left: (size - visualSize - 8) / 2,
              borderRadius: (visualSize + 8) / 2,
            },
          ]}
        />
      ) : null}

      <Animated.View
        style={[
          styles.artWrap,
          {
            width: visualSize,
            height: visualSize,
            opacity: settle,
            transform: [
              { scale: Animated.multiply(pressScale, settle.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.7, 1.06, 1] })) },
              { rotate: completed ? tilt : '0deg' },
            ],
          },
        ]}
      >
        {completed ? (
          <Image source={completedArt} resizeMode="contain" style={styles.art} />
        ) : isToday ? (
          // Tonight is *not* earned yet, so it keeps the embossed artwork. It is
          // distinguished by warmth and light, not by borrowing the earned art.
          <Animated.View style={styles.todayWrap}>
            <Animated.View
              style={[
                styles.todayDisc,
                {
                  opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
                  transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.02] }) }],
                },
              ]}
            />
            <Image source={embossedArt} resizeMode="contain" style={[styles.art, styles.todayArt]} />
          </Animated.View>
        ) : (
          <View style={styles.fill}>
            {/* The motif stays faint; the cross over it does not, so a missed
                night reads as marked rather than merely dim. */}
            <View style={[styles.fill, missed && styles.missed]}>
              <Image source={embossedArt} resizeMode="contain" style={[styles.art, styles.embossedArt]} />
            </View>
            {missed && !thumbnail ? <MissedMark size={visualSize} /> : null}
          </View>
        )}
        {isNew && !thumbnail ? <Dust size={visualSize} reducedMotion={reducedMotion} /> : null}
        {/* A single band of light travelling across the fresh sticker, once. */}
        {isNew && !thumbnail && !reducedMotion ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.sheen,
              {
                height: visualSize * 1.5,
                opacity: sheen.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: [0, 0.75, 0.55, 0] }),
                transform: [
                  { rotate: '22deg' },
                  { translateX: sheen.interpolate({ inputRange: [0, 1], outputRange: [-visualSize, visualSize] }) },
                ],
              },
            ]}
          />
        ) : null}
        {/* An earned gilded night keeps a live glint on the sheet — the rarity
            stays visible after the ceremony, not just during it. */}
        {completed && isGildedNight(night.index) && !thumbnail && !dense ? (
          <Sparkle size={10} color={colors.brass} twinkle delay={(night.index % 6) * 700} style={styles.gildedGlint} />
        ) : null}
      </Animated.View>


      {!thumbnail ? (
        <Text
          allowFontScaling={false}
          style={[styles.day, dense && styles.denseDay, completed && styles.completedDay, isToday && styles.todayDay]}
        >
          {night.index}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function WindowGrid({
  nights, onPressNight, revealed, thumbnail = false, maxWidth, maxHeight, dense = false, padToSheet = true, newlyEarned,
}: GridProps) {
  const reducedMotion = useReducedMotion();

  const displayedNights = useMemo(() => {
    const window = nights.slice(0, 30);
    if (!padToSheet || window.length >= 30) return window;
    const baseIndex = window[0]?.index ?? 1;
    return [
      ...window,
      ...Array.from({ length: 30 - window.length }, (_, offset) => ({
        id: `placeholder-${baseIndex + window.length + offset}`,
        index: baseIndex + window.length + offset,
        expectedLocalDate: '',
        timezone: '',
        questionId: `future_${baseIndex + window.length + offset}`,
        questionVersion: 'placeholder',
        status: 'future' as const,
        visualSeed: baseIndex + window.length + offset,
      })),
    ];
  }, [nights, padToSheet]);

  const { columns, columnGap, rowGap, labelSpace, ceiling, rows } = gridMetrics(displayedNights.length, dense, thumbnail);
  const widthLimit = thumbnail ? 84 : maxWidth ?? 360;
  // Leave a one-point rounding guard. Fabric rounds child widths to physical
  // pixels; an exact mathematical fit could otherwise push the final sticker
  // onto an orphan row inside bordered cards.
  const sizeFromWidth = (widthLimit - columnGap * (columns - 1) - 1) / columns;
  const sizeFromHeight = maxHeight
    ? (maxHeight - rowGap * (rows - 1)) / rows - labelSpace
    : Number.POSITIVE_INFINITY;
  // Capped so a short chapter on a tall screen does not inflate the artwork.
  const size = Math.max(1, Math.min(sizeFromWidth, sizeFromHeight, ceiling));
  const gridWidth = size * columns + columnGap * (columns - 1);
  const recorded = displayedNights.filter((night) => night.status === 'sealed' || night.status === 'revealed').length;

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Sticker sheet. ${recorded} of ${displayedNights.length} nights recorded.`}
      style={[styles.grid, { width: gridWidth, columnGap, rowGap }]}
    >
      {displayedNights.map((night) => (
        <Sticker
          key={night.index}
          night={night}
          size={size}
          thumbnail={thumbnail}
          reducedMotion={reducedMotion}
          dense={dense}
          isNew={newlyEarned === night.index}
          onPress={onPressNight && night.status !== 'future' ? () => onPressNight(night) : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    // A partial final row (e.g. three of four on a short sheet) sits centred,
    // which reads as deliberate composition rather than a ragged edge.
    justifyContent: 'center',
    position: 'relative',
  },
  slot: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'visible',
    ...Platform.select({ web: { outlineStyle: 'none' } as object }),
  },
  focusRing: {
    position: 'absolute',
    top: -4,
    borderWidth: 2,
    borderColor: colors.brass,
  },
  artWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The glow needs a sized, centred parent — anchored to a zero-width node it
  // rendered offset by half its own width.
  glowLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowInline: {
    position: 'relative',
  },
  art: {
    width: '100%',
    height: '100%',
  },
  embossedArt: {
    opacity: 0.55,
  },
  todayWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayDisc: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(250,226,228,0.92)',
    borderWidth: 2,
    borderColor: colors.white,
  },
  todayArt: {
    opacity: 0.92,
  },
  missed: {
    opacity: 0.4,
  },
  sheen: {
    position: 'absolute',
    width: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  gildedGlint: {
    position: 'absolute',
    top: -1,
    right: -2,
  },
  dustLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mote: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brass,
  },
  day: {
    marginTop: 3,
    color: colors.boneDim,
    fontFamily: typography.sans,
    fontWeight: weight.medium,
    fontSize: 12,
    lineHeight: 15,
  },
  denseDay: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 12,
  },
  completedDay: {
    color: colors.roseText,
    fontWeight: weight.bold,
  },
  todayDay: {
    color: colors.roseText,
    fontWeight: weight.bold,
  },
});
