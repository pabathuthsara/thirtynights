import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Check } from 'lucide-react-native';

import { colors, motion, radii, shadows, textStyles, weight } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type ToastMessage = { text: string; tone: 'success' | 'error' } | null;

/**
 * Feedback that finds the user, rather than a line of text appended to the
 * bottom of a long scrolling screen where they will never see it.
 */
export function Toast({ message, onDismiss, duration = 4200 }: {
  message: ToastMessage;
  onDismiss: () => void;
  duration?: number;
}) {
  const slide = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!message) return;

    if (reducedMotion) slide.setValue(1);
    else {
      Animated.spring(slide, { toValue: 1, damping: 22, stiffness: 250, mass: 0.8, useNativeDriver: true }).start();
    }

    const timer = setTimeout(() => {
      if (reducedMotion) {
        slide.setValue(0);
        onDismiss();
        return;
      }
      Animated.timing(slide, {
        toValue: 0,
        duration: motion.normal,
        easing: motion.easeSoft,
        useNativeDriver: true,
      }).start(({ finished }) => finished && onDismiss());
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, message, onDismiss, reducedMotion, slide]);

  if (!message) return null;
  const Icon = message.tone === 'success' ? Check : AlertTriangle;
  const tint = message.tone === 'success' ? colors.mossText : colors.ember;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          top: insets.top + 10,
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        },
      ]}
    >
      <View style={styles.toast}>
        <View style={[styles.iconWrap, { backgroundColor: message.tone === 'success' ? 'rgba(90,116,98,0.14)' : 'rgba(168,79,97,0.12)' }]}>
          <Icon size={15} strokeWidth={2.4} color={tint} />
        </View>
        <Text style={styles.text}>{message.text}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
    paddingHorizontal: 20,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    maxWidth: 460,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    ...shadows.lifted,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...textStyles.label,
    color: colors.bone,
    fontWeight: weight.medium,
    flexShrink: 1,
  },
});
