import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Buttons';
import { Screen } from '@/components/Screen';
import { colors, radii, textStyles, typography } from '@/theme';

type State = { error: Error | null };

/**
 * Without this, any render error anywhere produced a blank white screen with no
 * way out — on an app whose entire value is recordings the user cannot re-take.
 */
export class ErrorBoundary extends Component<PropsWithChildren<{ onReset?: () => void }>, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ThirtyNights] render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Screen scroll={false} contentStyle={styles.screen}>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Something went sideways.</Text>
          <Text style={styles.body}>
            Your recordings are stored on this device and were not touched. Reopening the screen is safe.
          </Text>
          <Text style={styles.detail} numberOfLines={4}>{error.message}</Text>
          <Button
            onPress={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          >
            Try again
          </Button>
        </View>
      </Screen>
    );
  }
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'center' },
  card: {
    gap: 14,
    padding: 26,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,253,249,0.9)',
  },
  title: { ...textStyles.title, fontSize: 32, lineHeight: 39 },
  body: { ...textStyles.bodySmall, fontSize: 15 },
  detail: {
    ...textStyles.caption,
    color: colors.boneFaint,
    fontFamily: typography.mono,
    fontSize: 12,
  },
});
