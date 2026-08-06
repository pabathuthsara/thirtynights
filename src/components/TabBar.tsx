import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Grid3X3, Map as MapIcon, Moon, type LucideIcon } from 'lucide-react-native';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, gradients, nativeAnimationDriver, radii, shadows, textStyles } from '@/theme';

export type TabKey = 'gallery' | 'home' | 'light-map';

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'gallery', label: 'Gallery', icon: Grid3X3 },
  { key: 'home', label: 'Tonight', icon: Moon },
  { key: 'light-map', label: 'Light Map', icon: MapIcon },
];

/** The island's own height, and the air it keeps beneath it. Screens sitting
 *  under a floating bar have to reserve this much or their last line hides. */
export const TAB_ISLAND_HEIGHT = 58;
export const TAB_ISLAND_LIFT = 12;

const ISLAND_PADDING = 6;

/**
 * A floating island rather than a bar welded to the bottom edge. It hovers over
 * the page so the paper gradient runs on underneath it, and it is shaped like
 * the app's own keepsake surfaces: warm translucent card stock, a sheen across
 * the top, a hairline of white. The lit capsule behind the active room travels
 * to its new home rather than blinking out and reappearing there — which is why
 * this is one persistent bar and not links inside each screen.
 */
export function TabBar({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, TABS.findIndex((tab) => tab.key === active));

  // One driver for the whole bar: the capsule's travel and every icon's lift are
  // read off the same value, so they can never disagree mid-flight.
  const pos = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    if (reducedMotion) {
      pos.setValue(index);
      return;
    }
    const travel = Animated.spring(pos, {
      toValue: index,
      useNativeDriver: nativeAnimationDriver,
      friction: 11,
      tension: 74,
    });
    travel.start();
    return () => travel.stop();
  }, [index, pos, reducedMotion]);

  const measure = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const column = width > 0 ? (width - ISLAND_PADDING * 2) / TABS.length : 0;

  return (
    <View
      onLayout={measure}
      style={[styles.island, { marginBottom: Math.max(insets.bottom, TAB_ISLAND_LIFT) }]}
    >
      <LinearGradient colors={gradients.cardSheen} style={styles.sheen} pointerEvents="none" />

      {column > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.capsuleTrack,
            {
              width: column,
              transform: [{
                translateX: pos.interpolate({
                  inputRange: [0, TABS.length - 1],
                  outputRange: [0, column * (TABS.length - 1)],
                }),
              }],
            },
          ]}
        >
          <View style={styles.capsule} />
        </Animated.View>
      ) : null}

      {TABS.map((tab, tabIndex) => {
        const selected = tabIndex === index;
        // Distance from this tab, 1 when the capsule is home. Every per-tab
        // animation is a function of it, so they arrive together.
        const near = pos.interpolate({
          inputRange: [tabIndex - 1, tabIndex, tabIndex + 1],
          outputRange: [0, 1, 0],
          extrapolate: 'clamp',
        });
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            <Animated.View
              style={{
                transform: [
                  { scale: near.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
                  { translateY: near.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) },
                ],
              }}
            >
              <tab.icon
                size={19}
                strokeWidth={selected ? 2.1 : 1.8}
                color={selected ? colors.roseText : colors.boneFaint}
              />
            </Animated.View>
            <Animated.Text
              numberOfLines={1}
              style={[
                styles.label,
                selected && styles.labelActive,
                { opacity: near.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
              ]}
            >
              {tab.label}
            </Animated.Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  island: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TAB_ISLAND_HEIGHT,
    marginHorizontal: 18,
    padding: ISLAND_PADDING,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    // Translucent card stock: the page's own gradient tints the glass instead of
    // a flat white slab cutting the bottom of the screen off.
    backgroundColor: 'rgba(255,253,249,0.90)',
    overflow: 'hidden',
    ...shadows.floating,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '58%',
  },
  /** A full column, so the capsule inside it lands optically centred on each tab
   *  no matter how wide the island gets. */
  capsuleTrack: {
    position: 'absolute',
    top: ISLAND_PADDING,
    left: ISLAND_PADDING,
    bottom: ISLAND_PADDING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Wraps the icon *and* its label. Lit behind the glyph alone, it read as a
   *  smudge rather than a chosen room. */
  capsule: {
    alignSelf: 'stretch',
    marginHorizontal: 3,
    flex: 1,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(190,111,124,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(190,111,124,0.24)',
  },
  tab: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabPressed: {
    opacity: 0.62,
  },
  label: {
    ...textStyles.eyebrow,
    fontSize: 8.5,
    letterSpacing: 1,
    color: colors.boneFaint,
  },
  labelActive: {
    color: colors.roseText,
  },
});
