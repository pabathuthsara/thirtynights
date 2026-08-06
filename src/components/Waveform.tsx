import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors, motion, nativeAnimationDriver } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const BAR_WIDTH = 3;
const BAR_GAP = 3;

/**
 * Two modes:
 *  - `levels` supplied  → live meter. Each bar is driven by a real amplitude
 *    sample, so the user can see that the microphone is hearing them.
 *  - `progress` only    → playback scrubber over a stable, seeded shape.
 */
export function Waveform({
  levels,
  progress = 0,
  paper = false,
  compact = false,
  active = false,
  idle = false,
}: {
  levels?: number[];
  progress?: number;
  paper?: boolean;
  compact?: boolean;
  active?: boolean;
  /** Nothing recorded yet: render a quiet resting line instead of a fake
   *  waveform shape, which read as "already recorded" next to a 00:00 timer. */
  idle?: boolean;
}) {
  const count = compact ? 38 : 52;
  const height = compact ? 40 : 52;
  const reducedMotion = useReducedMotion();

  // A stable pseudo-random silhouette for playback mode. Seeded, so a given
  // report always renders the same shape.
  const seeded = useMemo(
    () => Array.from({ length: count }, (_, index) => {
      const wave = Math.sin(index * 0.55) * 0.28 + Math.sin(index * 1.7) * 0.16;
      const jitter = ((index * 2654435761) % 1000) / 1000;
      return Math.min(1, Math.max(0.16, 0.46 + wave + jitter * 0.28));
    }),
    [count],
  );

  const targets = levels && levels.length ? levels : seeded;
  const scales = useRef<Animated.Value[]>([]);
  if (scales.current.length !== count) {
    scales.current = Array.from({ length: count }, (_, index) => scales.current[index] ?? new Animated.Value(0.16));
  }

  useEffect(() => {
    if (idle) {
      // A barely-breathing baseline: present, but clearly waiting for a voice.
      scales.current.forEach((value, index) => value.setValue(0.1 + (seeded[index % seeded.length] ?? 0.5) * 0.08));
      return;
    }
    const animations = scales.current.map((value, index) => {
      // Live samples arrive newest-last; map them to the right-hand edge so the
      // meter reads as scrolling history.
      const offset = targets.length - count + index;
      const next = Math.min(1, Math.max(0.14, targets[offset] ?? targets[index % targets.length] ?? 0.16));
      if (reducedMotion) {
        value.setValue(next);
        return null;
      }
      return Animated.spring(value, {
        toValue: next,
        damping: 14,
        stiffness: 220,
        mass: 0.4,
        useNativeDriver: nativeAnimationDriver,
      });
    }).filter(Boolean) as Animated.CompositeAnimation[];

    if (!animations.length) return;
    Animated.parallel(animations).start();
  }, [count, idle, reducedMotion, seeded, targets]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.row, { height }]}
    >
      {scales.current.map((scale, index) => {
        const played = !idle && index / count <= progress;
        const color = idle
          ? 'rgba(118,82,99,0.24)'
          : paper
            ? played ? colors.roseText : 'rgba(110,75,91,0.22)'
            : played || active
              ? index % 6 === 0 ? colors.brass : colors.rose
              : 'rgba(118,82,99,0.20)';
        return (
          <Animated.View
            key={index}
            style={[
              styles.bar,
              {
                height: height - 8,
                backgroundColor: color,
                opacity: idle ? 0.55 : played || active ? 0.95 : 0.4,
                transform: [{ scaleY: scale }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: BAR_GAP,
    overflow: 'hidden',
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH,
    // Bars may shrink in a narrow container rather than overflowing it.
    flexShrink: 1,
    minWidth: 2,
  },
});
