import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BellRing, Check } from 'lucide-react-native';

import { Button, TextButton } from '@/components/Buttons';
import { Screen, Stagger } from '@/components/Screen';
import { Glow, Sparkle } from '@/components/Sparkle';
import { formatClock } from '@/domain/format';
import { colors, HIT_TARGET, radii, shadows, textStyles, typography, weight } from '@/theme';

// Realistic bedtimes, evening through the small hours.
const hours = [19, 20, 21, 22, 23, 0, 1, 2];
const minutes = [0, 15, 30, 45];

export function HourPickerScreen({ hour, minute, onChange, onContinue }: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  onContinue: () => void;
}) {
  const select = (nextHour: number, nextMinute: number) => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    onChange(nextHour, nextMinute);
  };

  return (
    <Screen contentStyle={styles.setupScreen}>
      <Stagger index={0}>
        <Text style={textStyles.eyebrow}>YOUR HOUR</Text>
        <Text accessibilityRole="header" style={styles.title}>What time are you usually in bed?</Text>
        <Text style={styles.body}>The question arrives once, at this time. Change it whenever your nights change.</Text>
      </Stagger>

      <Stagger index={1} style={styles.clockWrap}>
        <Glow size={260} color={colors.rose} opacity={0.22} style={styles.clockGlow} />
        <Sparkle size={14} color={colors.brass} twinkle style={styles.clockSparkle} />
        <Text style={styles.clock}>{formatClock(hour, minute)}</Text>

        <Text style={styles.pickerLabel}>HOUR</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {hours.map((value) => {
            const selected = hour === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={formatClock(value, minute)}
                onPress={() => select(value, minute)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                  {formatClock(value, 0).replace(/[:.]00/, '')}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.pickerLabel}>MINUTES</Text>
        <View style={styles.chipRow}>
          {minutes.map((value) => {
            const selected = minute === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${value} minutes past`}
                onPress={() => select(hour, value)}
                style={[styles.chip, styles.minuteChip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                  :{String(value).padStart(2, '0')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Stagger>

      <Stagger index={2}>
        <Button onPress={onContinue}>Set reminder for {formatClock(hour, minute)}</Button>
      </Stagger>
    </Screen>
  );
}

export function NotificationPrimerScreen({ hour, minute, nightIndex, question, onAllow, onSkip }: {
  hour: number;
  minute: number;
  nightIndex: number;
  question: string;
  onAllow: () => Promise<void>;
  onSkip: () => void;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <Screen contentStyle={styles.setupScreen}>
      <Stagger index={0}>
        <Text style={textStyles.eyebrow}>ONE NOTIFICATION</Text>
        <Text accessibilityRole="header" style={styles.title}>The app has to reach you.</Text>
        <Text style={styles.body}>
          One question a night, at {formatClock(hour, minute)}. Nothing promotional. Never more than once a day.
        </Text>
      </Stagger>

      <Stagger index={1} style={styles.bellVisual}>
        <View style={styles.bellRing}>
          <Glow size={210} color={colors.rose} opacity={0.3} style={styles.bellGlow} />
          <BellRing size={52} strokeWidth={1.5} color={colors.roseText} />
        </View>
        {/* A preview of the real thing, using the user's actual next question. */}
        <View style={styles.notificationCard}>
          <View style={styles.notificationTop}>
            <View style={styles.notificationBadge}><Sparkle size={9} color={colors.white} /></View>
            <Text style={styles.notificationApp}>THIRTY NIGHTS</Text>
            <Text style={styles.notificationNow}>{formatClock(hour, minute)}</Text>
          </View>
          <Text style={styles.notificationTitle}>Night {nightIndex}</Text>
          <Text numberOfLines={2} style={styles.notificationBody}>{question}</Text>
        </View>
      </Stagger>

      <Stagger index={2} style={styles.actionStack}>
        <Button
          icon={Check}
          loading={loading}
          onPress={async () => {
            setLoading(true);
            try {
              await onAllow();
            } finally {
              setLoading(false);
            }
          }}
        >
          Allow notifications
        </Button>
        <TextButton onPress={onSkip}>{Platform.OS === 'web' ? 'Continue in browser preview' : 'Not now'}</TextButton>
      </Stagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  setupScreen: {
    justifyContent: 'space-between',
    gap: 24,
    paddingBottom: 28,
  },
  title: {
    ...textStyles.title,
    fontSize: 38,
    lineHeight: 45,
    marginTop: 12,
    marginBottom: 14,
  },
  body: {
    ...textStyles.bodySmall,
  },

  clockWrap: {
    alignItems: 'center',
    gap: 12,
    padding: 24,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    backgroundColor: 'rgba(255,253,249,0.86)',
    overflow: 'hidden',
    ...shadows.floating,
  },
  clockGlow: { top: -110, left: -20 },
  clockSparkle: { position: 'absolute', top: 18, right: 22 },
  clock: {
    color: colors.bone,
    fontFamily: typography.serifSemiBold,
    fontSize: 58,
    lineHeight: 68,
    letterSpacing: -1.5,
  },
  pickerLabel: {
    ...textStyles.eyebrow,
    fontSize: 10,
    letterSpacing: 1.8,
    marginTop: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  chip: {
    minHeight: HIT_TARGET,
    minWidth: 62,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  minuteChip: { minWidth: 66 },
  chipSelected: {
    backgroundColor: colors.roseDeep,
    borderColor: colors.roseDeep,
  },
  chipLabel: {
    color: colors.boneDim,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 14,
  },
  chipLabelSelected: {
    color: colors.white,
  },

  bellVisual: {
    alignItems: 'center',
    gap: 24,
  },
  bellRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,253,249,0.86)',
    ...shadows.floating,
  },
  bellGlow: { top: -47, left: -47 },
  notificationCard: {
    width: '100%',
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    backgroundColor: colors.white,
    ...shadows.floating,
    shadowOpacity: 0.12,
  },
  notificationTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  notificationBadge: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.roseDeep,
  },
  notificationApp: {
    flex: 1,
    color: colors.boneDim,
    fontFamily: typography.monoMedium,
    fontSize: 10,
    letterSpacing: 1.1,
  },
  notificationNow: {
    ...textStyles.caption,
    color: colors.boneFaint,
    fontSize: 11,
  },
  notificationTitle: {
    color: colors.bone,
    fontFamily: typography.serifSemiBold,
    fontSize: 17,
  },
  notificationBody: {
    ...textStyles.bodySmall,
    fontSize: 14,
    marginTop: 3,
  },
  actionStack: {
    alignItems: 'center',
    gap: 14,
  },
});
