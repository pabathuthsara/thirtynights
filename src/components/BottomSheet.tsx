import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, TextButton } from '@/components/Buttons';
import { colors, gradients, motion, radii, textStyles } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type SheetAction = {
  label: string;
  onPress: () => void;
  variant?: 'bone' | 'outline' | 'ghost' | 'ember';
};

export function BottomSheet({ visible, title, body, actions, footer, children, onClose, blocking = false }: {
  visible: boolean;
  title: string;
  body?: string;
  actions?: SheetAction[];
  footer?: { label: string; onPress: () => void };
  children?: ReactNode;
  onClose: () => void;
  blocking?: boolean;
}) {
  // The modal stays mounted through the exit animation, otherwise the spring
  // out is never seen — the modal used to unmount the instant `visible` flipped.
  const [mounted, setMounted] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(560);
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    // Travel exactly as far as the sheet is tall, so it always clears the frame.
    const hidden = sheetHeight + insets.bottom + 24;

    if (reducedMotion) {
      translateY.setValue(visible ? 0 : hidden);
      backdrop.setValue(visible ? 1 : 0);
      if (!visible) setMounted(false);
      return;
    }

    const animation = Animated.parallel([
      Animated.spring(translateY, {
        toValue: visible ? 0 : hidden,
        damping: visible ? 26 : 30,
        stiffness: visible ? 260 : 340,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.timing(backdrop, {
        toValue: visible ? 1 : 0,
        duration: visible ? motion.normal : motion.fast,
        easing: motion.easeSoft,
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [backdrop, insets.bottom, mounted, reducedMotion, sheetHeight, translateY, visible]);

  if (!mounted) return null;

  const maxSheetHeight = Math.max(260, windowHeight - insets.top - 56);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={blocking ? undefined : onClose}>
      <View style={styles.modal}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: backdrop }]} pointerEvents="none" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          disabled={blocking}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <Animated.View
          accessibilityViewIsModal
          importantForAccessibility="yes"
          onLayout={(event) => {
            const measured = Math.ceil(event.nativeEvent.layout.height);
            if (measured > 0 && Math.abs(measured - sheetHeight) > 1) setSheetHeight(measured);
          }}
          style={[
            styles.sheet,
            { maxHeight: maxSheetHeight, paddingBottom: 26 + insets.bottom, transform: [{ translateY }] },
          ]}
        >
          <LinearGradient colors={gradients.cardSheen} style={styles.sheetSheen} pointerEvents="none" />
          <View style={styles.handle} />
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetScroll}
          >
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            {body ? <Text style={styles.body}>{body}</Text> : null}
            {children}
            {actions?.length ? (
              <View style={styles.actions}>
                {actions.map((action) => (
                  <Button key={action.label} variant={action.variant ?? 'bone'} onPress={action.onPress}>{action.label}</Button>
                ))}
              </View>
            ) : null}
            {footer ? (
              <View style={styles.footer}>
                <TextButton onPress={footer.onPress}>{footer.label}</TextButton>
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  scrim: {
    backgroundColor: 'rgba(58,28,40,0.42)',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 26,
    paddingTop: 12,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 24,
  },
  sheetSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
  },
  sheetScroll: {
    paddingBottom: 4,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.blush,
    alignSelf: 'center',
    marginBottom: 22,
  },
  title: {
    ...textStyles.title,
    fontSize: 30,
    lineHeight: 37,
    marginBottom: 10,
  },
  body: {
    ...textStyles.body,
    color: colors.boneDim,
    marginBottom: 22,
  },
  actions: {
    gap: 10,
    marginTop: 10,
  },
  footer: {
    alignItems: 'center',
    marginTop: 14,
  },
});
