import { useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';

import { colors, gradients, HIT_TARGET, motion, nativeAnimationDriver, night as nightTheme, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type Variant = 'bone' | 'outline' | 'ghost' | 'ember' | 'paper';

type ButtonProps = PropsWithChildren<{
  onPress?: () => void;
  icon?: LucideIcon;
  right?: ReactNode;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Suppress the press haptic for low-stakes or repeated actions. */
  haptic?: boolean;
}>;

const filled = (variant: Variant) => variant === 'bone' || variant === 'ember';

/** Shared press behaviour: a real, felt depression rather than a 0.8% scale. */
function usePressAnimation(enabled: boolean) {
  const press = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  const to = (value: number) => {
    if (!enabled || reducedMotion) return;
    Animated.spring(press, {
      toValue: value,
      damping: 18,
      stiffness: 380,
      mass: 0.55,
      useNativeDriver: nativeAnimationDriver,
    }).start();
  };

  return {
    onPressIn: () => to(1),
    onPressOut: () => to(0),
    style: {
      transform: [
        { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.965] }) },
        { translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, 1.5] }) },
      ],
    },
  };
}

export function Button({
  children, onPress, icon: Icon, right, variant = 'bone', disabled, loading, style, accessibilityLabel, haptic = true,
}: ButtonProps) {
  const inactive = Boolean(disabled || loading);
  const foreground = filled(variant) ? colors.white : colors.bone;
  const animation = usePressAnimation(!inactive);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handlePress = () => {
    if (haptic && Platform.OS !== 'web') {
      void Haptics.impactAsync(
        variant === 'ember' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
      ).catch(() => undefined);
    }
    onPress?.();
  };

  return (
    <Animated.View style={[styles.buttonWrap, animation.style, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={handlePress}
        onPressIn={animation.onPressIn}
        onPressOut={animation.onPressOut}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        android_ripple={filled(variant) ? { color: 'rgba(255,255,255,0.20)' } : { color: 'rgba(190,111,124,0.16)' }}
        style={[
          styles.button,
          styles[variant],
          hovered && !inactive && (filled(variant) ? styles.hoveredFilled : styles.hovered),
          focused && styles.focused,
          inactive && styles.disabled,
        ]}
      >
        {filled(variant) ? (
          <LinearGradient
            colors={variant === 'ember' ? gradients.ember : gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {/* A single sheen across the top edge so filled buttons read as lit, not printed. */}
        {filled(variant) ? (
          <LinearGradient
            colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0)']}
            style={styles.sheen}
            pointerEvents="none"
          />
        ) : null}
        <View style={styles.iconSlot}>
          {loading ? (
            <ActivityIndicator size="small" color={foreground} />
          ) : Icon ? (
            <Icon size={19} strokeWidth={1.9} color={foreground} />
          ) : null}
        </View>
        <Text numberOfLines={2} style={[styles.label, { color: foreground }]}>{children}</Text>
        <View style={styles.iconSlot}>{right}</View>
      </Pressable>
    </Animated.View>
  );
}

export function TextButton({ children, onPress, color = colors.roseText, accessibilityLabel }: PropsWithChildren<{
  onPress?: () => void;
  color?: string;
  accessibilityLabel?: string;
}>) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hitSlop={16}
      style={({ pressed }) => [styles.textButton, focused && styles.textFocused, pressed && styles.textPressed]}
    >
      <Text style={[styles.textButtonLabel, { color }]}>{children}</Text>
    </Pressable>
  );
}

export function IconButton({ icon: Icon, onPress, paper = false, night = false, label, badge = false }: {
  icon: LucideIcon;
  onPress?: () => void;
  paper?: boolean;
  /** Rendered over the nightfall atmosphere: translucent plum, light glyph. */
  night?: boolean;
  label: string;
  badge?: boolean;
}) {
  const animation = usePressAnimation(true);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <Animated.View style={animation.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          onPress?.();
        }}
        onPressIn={animation.onPressIn}
        onPressOut={animation.onPressOut}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        hitSlop={10}
        android_ripple={{ color: 'rgba(190,111,124,0.18)', borderless: true, radius: 26 }}
        style={[styles.iconButton, night && styles.iconNight, hovered && styles.iconHovered, focused && styles.iconFocused]}
      >
        <Icon size={21} strokeWidth={1.8} color={night ? nightTheme.text : paper ? colors.paperInk : colors.bone} />
        {badge ? <View style={styles.badge} /> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  buttonWrap: {
    width: '100%',
  },
  button: {
    width: '100%',
    minHeight: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '52%',
  },
  bone: {
    backgroundColor: colors.roseDeep,
    borderColor: 'rgba(255,255,255,0.22)',
    ...shadows.floating,
    shadowColor: '#8A3547',
  },
  paper: {
    backgroundColor: colors.white,
    borderColor: colors.lineStrong,
    ...shadows.soft,
  },
  outline: {
    backgroundColor: surfaces.card,
    borderColor: colors.lineStrong,
  },
  ghost: {
    backgroundColor: surfaces.cardSoft,
    borderColor: colors.line,
  },
  ember: {
    backgroundColor: colors.ember,
    borderColor: 'rgba(255,255,255,0.20)',
    ...shadows.floating,
    shadowColor: '#7C2C3E',
  },
  disabled: {
    opacity: 0.55,
    shadowOpacity: 0,
    elevation: 0,
  },
  hovered: {
    borderColor: 'rgba(175,79,95,0.48)',
    backgroundColor: colors.white,
  },
  hoveredFilled: {
    opacity: 0.92,
    borderColor: 'rgba(255,255,255,0.46)',
  },
  focused: {
    borderColor: colors.brass,
    borderWidth: 2,
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 16,
    letterSpacing: 0.2,
  },
  iconSlot: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButton: {
    minHeight: HIT_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  textPressed: {
    opacity: 0.6,
  },
  textFocused: {
    borderRadius: radii.sm,
    backgroundColor: 'rgba(228,194,122,0.18)',
  },
  textButtonLabel: {
    ...textStyles.label,
    fontSize: 14,
    letterSpacing: 0.2,
    textDecorationLine: 'underline',
    textDecorationColor: colors.lineStrong,
  },
  iconButton: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: HIT_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    ...shadows.soft,
    shadowOpacity: 0.10,
  },
  iconNight: {
    backgroundColor: nightTheme.surface,
    borderColor: nightTheme.line,
    shadowOpacity: 0,
    elevation: 0,
  },
  iconHovered: {
    backgroundColor: colors.white,
    borderColor: 'rgba(175,79,95,0.32)',
  },
  iconFocused: {
    borderColor: colors.brass,
    borderWidth: 2,
  },
  badge: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brass,
    borderWidth: 1,
    borderColor: colors.white,
  },
});
