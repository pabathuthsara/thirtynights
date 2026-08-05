import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Stop, Circle } from 'react-native-svg';

import { colors, motion } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const AnimatedView = Animated.createAnimatedComponent(View);

/**
 * A four-point keepsake sparkle. Replaces the previous approach of crossing two
 * rounded rects (which rendered as a smudge) and of using the `✦` text glyph
 * (which is at the mercy of the platform font).
 */
export function Sparkle({ size = 14, color = colors.brass, style, twinkle = false, delay = 0 }: {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  twinkle?: boolean;
  delay?: number;
}) {
  const pulse = useRef(new Animated.Value(twinkle ? 0 : 1)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!twinkle || reducedMotion) {
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(pulse, { toValue: 1, duration: 1900, easing: motion.easeInOut, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.25, duration: 2300, easing: motion.easeInOut, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [delay, pulse, reducedMotion, twinkle]);

  return (
    <AnimatedView
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        style,
        {
          width: size,
          height: size,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
        },
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {/* Concave diamond: the classic sparkle silhouette. */}
        <Path
          d="M12 0 C12.9 7.2 16.8 11.1 24 12 C16.8 12.9 12.9 16.8 12 24 C11.1 16.8 7.2 12.9 0 12 C7.2 11.1 11.1 7.2 12 0 Z"
          fill={color}
        />
      </Svg>
    </AnimatedView>
  );
}

/** A soft radial glow used behind stickers and the record button. */
export function Glow({ size, color = colors.rose, opacity = 0.55, style }: {
  size: number;
  color?: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View pointerEvents="none" style={[styles.absolute, style, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <Stop offset="55%" stopColor={color} stopOpacity={opacity * 0.42} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill="url(#glow)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: {
    position: 'absolute',
  },
});
