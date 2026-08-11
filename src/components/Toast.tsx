import { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Check, X } from 'lucide-react-native';

import { colors, motion, nativeAnimationDriver, radii, shadows, textStyles, weight } from '@/theme';
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
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!message) return;

    if (reducedMotion) slide.setValue(1);
    else {
      Animated.spring(slide, { toValue: 1, damping: 22, stiffness: 250, mass: 0.8, useNativeDriver: nativeAnimationDriver }).start();
    }

    // Errors that may govern deletion, backup, or a purchase stay until the
    // person dismisses them. Success confirmations can remain brief.
    if (message.tone === 'error') return;
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
        useNativeDriver: nativeAnimationDriver,
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
      accessibilityRole="alert"
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: insets.top + 10,
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        },
      ]}
    >
      <View style={[styles.toast, { maxHeight: Math.max(160, height - insets.top - insets.bottom - 32) }]}>
        <View style={[styles.iconWrap, { backgroundColor: message.tone === 'success' ? 'rgba(90,116,98,0.14)' : 'rgba(168,79,97,0.12)' }]}>
          <Icon size={15} strokeWidth={2.4} color={tint} />
        </View>
        <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.text}>{message.text}</Text>
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          hitSlop={6}
          onPress={onDismiss}
          style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
        >
          <X size={17} strokeWidth={2.2} color={colors.boneDim} />
        </Pressable>
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
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    marginTop: 9,
  },
  messageScroll: { flex: 1 },
  messageContent: { paddingVertical: 10 },
  text: {
    ...textStyles.label,
    color: colors.bone,
    fontWeight: weight.medium,
  },
  dismiss: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  dismissPressed: { opacity: 0.55 },
});
