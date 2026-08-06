import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { colors, HIT_TARGET, motion, nativeAnimationDriver, shadows, surfaces, typography, weight } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const tabs = [
  { id: 'windows', label: 'Gallery' },
  { id: 'light-map', label: 'Light Map' },
] as const;

export function SegmentedTabs({ value, onChange }: {
  value: 'windows' | 'light-map';
  onChange: (value: 'windows' | 'light-map') => void;
}) {
  const [width, setWidth] = useState(0);
  const slide = useRef(new Animated.Value(value === 'windows' ? 0 : 1)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const toValue = value === 'windows' ? 0 : 1;
    if (reducedMotion) {
      slide.setValue(toValue);
      return;
    }
    const animation = Animated.spring(slide, {
      toValue,
      damping: 20,
      stiffness: 220,
      mass: 0.7,
      useNativeDriver: nativeAnimationDriver,
    });
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, slide, value]);

  const trackWidth = Math.max(0, width - 10);
  const pillWidth = trackWidth / tabs.length;

  return (
    <View
      accessibilityRole="tablist"
      style={styles.row}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: pillWidth,
              transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, pillWidth] }) }],
            },
          ]}
        />
      ) : null}
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => {
              if (active) return;
              if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
              onChange(tab.id);
            }}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            <Text style={[styles.label, active && styles.activeLabel]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    padding: 5,
    marginBottom: 26,
    borderRadius: 999,
    backgroundColor: surfaces.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  indicator: {
    position: 'absolute',
    left: 5,
    top: 5,
    bottom: 5,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    ...shadows.soft,
    shadowOpacity: 0.10,
  },
  tab: {
    flex: 1,
    minHeight: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPressed: {
    opacity: 0.62,
  },
  label: {
    color: colors.boneDim,
    fontFamily: typography.sans,
    fontWeight: weight.medium,
    fontSize: 15,
    textAlign: 'center',
  },
  activeLabel: {
    color: colors.roseText,
    fontWeight: weight.bold,
  },
});
