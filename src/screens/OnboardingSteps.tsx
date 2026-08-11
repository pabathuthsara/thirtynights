import { useMemo } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ArrowRight, Check, Clock } from 'lucide-react-native';

import { Button, TextButton } from '@/components/Buttons';
import { Screen, Stagger } from '@/components/Screen';
import { Sparkle } from '@/components/Sparkle';
import { embossedStickerAssets, keepsakeDecorations, mysteryEmboss, stickerAssetForNight } from '@/data/keepsakeAssets';
import { formatClock, formatLongDate } from '@/domain/format';
import { intentions, intentionsById, plannedChapter, type IntentionId } from '@/domain/onboarding';
import { colors, gradients, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';

/**
 * "What brings you here?" — multi-select, because people arrive with more than
 * one reason and being made to choose one is a small lie the product then has
 * to live with. Nothing here is required: every answer is optional, the
 * continue button never disables, and the app is fully usable if this screen is
 * skipped outright. It exists to make the next screen mean something.
 */
export function IntentionScreen({ selected, onToggle, onContinue, onSkip }: {
  selected: readonly IntentionId[];
  onToggle: (id: IntentionId) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const pick = (id: IntentionId) => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
    onToggle(id);
  };

  return (
    <Screen contentStyle={styles.screen}>
      <Stagger index={0}>
        <Text style={styles.aside}>Before your first night</Text>
        <Text accessibilityRole="header" style={styles.title}>What brings you here?</Text>
        <Text style={styles.body}>
          Pick as many as are true — most people have more than one. It only changes what the app says back to you.
        </Text>
      </Stagger>

      <Stagger index={1} style={styles.options}>
        {intentions.map((intention) => {
          const active = selected.includes(intention.id);
          return (
            <Pressable
              key={intention.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${intention.label}. ${intention.aside}.`}
              onPress={() => pick(intention.id)}
              style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.optionPressed]}
            >
              {active ? <LinearGradient colors={gradients.cardSheen} style={styles.optionSheen} pointerEvents="none" /> : null}
              <View style={[styles.box, active && styles.boxActive]}>
                {active ? <Check size={13} strokeWidth={3} color={colors.white} /> : null}
              </View>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{intention.label}</Text>
                <Text style={styles.optionAside}>{intention.aside}</Text>
              </View>
            </Pressable>
          );
        })}
      </Stagger>

      <Stagger index={2} style={styles.footer}>
        <Button icon={ArrowRight} onPress={onContinue}>
          {selected.length ? 'That sounds right' : 'Continue'}
        </Button>
        <TextButton onPress={onSkip}>Skip this</TextButton>
      </Stagger>
    </Screen>
  );
}

/** Seven stickers, one lit — the sheet as it will look after tonight. */
function SheetPreview() {
  return (
    <View style={styles.sheet} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 7 }, (_, index) => (
        <View key={index} style={styles.sheetCell}>
          {index === 0 ? (
            <View style={styles.sheetTonight}>
              <Image source={mysteryEmboss} resizeMode="contain" style={styles.sheetArt} />
            </View>
          ) : (
            <Image
              source={stickerAssetForNight(embossedStickerAssets, index + 1)}
              resizeMode="contain"
              style={[styles.sheetArt, styles.sheetFuture]}
            />
          )}
        </View>
      ))}
    </View>
  );
}

/**
 * The payoff screen — the one piece the flow was missing.
 *
 * Endel, BitePal and Speak all end their questions on a screen that states the
 * result in real dates and numbers rather than thanking you for answering. Ask
 * five questions and show nothing for them and the quiz was a toll booth; show
 * the plan the answers built and the same five questions read as the app
 * getting ready for you. Everything on this screen is true: the hour is the one
 * that was chosen, the dates come from the device calendar, and the promises
 * are the ones the product actually keeps.
 */
export function PlanScreen({ picked, hour, minute, notificationsEnabled, freeNights, fullLength, onStart }: {
  picked: readonly IntentionId[];
  hour: number;
  minute: number;
  notificationsEnabled: boolean;
  freeNights: number;
  fullLength: number;
  onStart: () => void;
}) {
  const plan = useMemo(() => plannedChapter(freeNights, fullLength), [freeNights, fullLength]);
  // With nothing picked the screen still has to say something — these two are
  // what the product does for everyone.
  const promises = useMemo(() => {
    const chosen = intentionsById(picked);
    return (chosen.length ? chosen : intentionsById(['hear', 'remember'])).slice(0, 3);
  }, [picked]);

  return (
    <Screen contentStyle={styles.screen}>
      <Stagger index={0}>
        <Text style={styles.aside}>Your first seven nights</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Your first {freeNights} nights are included free.
        </Text>
        <Text style={styles.planIntro}>
          No card required. Night {freeNights} brings your first reflection. After that, one payment unlocks nights {freeNights + 1}–{fullLength} in this same journey. Nothing renews.
        </Text>
      </Stagger>

      <Stagger index={1}>
        <View style={styles.planCard}>
          <LinearGradient colors={gradients.cardSheen} style={styles.planSheen} pointerEvents="none" />
          <Image
            source={keepsakeDecorations.waxSeal}
            resizeMode="contain"
            accessibilityElementsHidden
            style={styles.planSeal}
          />

          <SheetPreview />

          <View style={styles.planRow}>
            <Clock size={14} strokeWidth={2} color={colors.paperDim} />
            <Text style={styles.planWhen}>
              {notificationsEnabled ? 'Your first question arrives' : 'Your first question opens'} at {formatClock(hour, minute)}
            </Text>
          </View>
          <Text style={styles.planThrough}>
            Included through {formatLongDate(plan.freeEndsOn)}, when your first reflection is due.
          </Text>

          <View style={styles.offerBoundary}>
            <Text style={styles.offerIncluded}>NIGHTS 1–{freeNights} · INCLUDED</Text>
            <View style={styles.offerDivider} />
            <Text style={styles.offerContinuation}>NIGHTS {freeNights + 1}–{fullLength} · ONE PAYMENT · NO RENEWAL</Text>
          </View>
        </View>
      </Stagger>

      <Stagger index={2} style={styles.promises}>
        {promises.map((intention) => (
          <View key={intention.id} style={styles.promiseRow}>
            <Sparkle size={11} color={colors.brass} />
            <View style={styles.promiseCopy}>
              <Text style={styles.promiseLabel}>{intention.label}</Text>
              <Text style={styles.promiseBody}>{intention.promise}</Text>
            </View>
          </View>
        ))}
      </Stagger>

      {/* A note in a human hand at the moment the product hands over. Basecamp
          and One Year both do this and it is the cheapest warmth in the flow. */}
      <Stagger index={3}>
        <View style={styles.note}>
          <Image
            source={keepsakeDecorations.driedFlowers}
            resizeMode="contain"
            accessibilityElementsHidden
            style={styles.noteFlowers}
          />
          <Text style={styles.noteBody}>
            I built this because I could not remember a single thing I thought about during a whole year of my life.
            Thirty nights of your own voice is a strange and lovely thing to own. I hope you keep them all.
          </Text>
          <Text style={styles.noteSign}>— the maker</Text>
        </View>
      </Stagger>

      <Stagger index={4} style={styles.footer}>
        <Button icon={ArrowRight} onPress={onStart}>Open my first night</Button>
      </Stagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 22,
    paddingBottom: 30,
  },
  aside: {
    color: colors.paperDim,
    fontFamily: typography.serifItalic,
    fontSize: 17,
  },
  title: {
    ...textStyles.title,
    fontSize: 38,
    lineHeight: 45,
    marginTop: 10,
  },
  body: {
    ...textStyles.bodySmall,
    fontSize: 16,
    lineHeight: 25,
    marginTop: 12,
  },
  planIntro: {
    ...textStyles.bodySmall,
    fontSize: 16,
    lineHeight: 25,
    marginTop: 12,
    maxWidth: 430,
  },

  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(184,134,53,0.2)',
    backgroundColor: surfaces.card,
    overflow: 'hidden',
    ...shadows.soft,
    shadowOpacity: 0.06,
  },
  optionActive: {
    borderColor: colors.roseDeep,
    backgroundColor: surfaces.selected,
  },
  optionPressed: { opacity: 0.86 },
  optionSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 44 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { backgroundColor: colors.roseDeep, borderColor: colors.roseDeep },
  optionCopy: { flex: 1, gap: 2 },
  optionLabel: {
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 18,
    lineHeight: 24,
  },
  optionLabelActive: { color: colors.paperInk },
  optionAside: {
    color: colors.paperDim,
    fontFamily: typography.serifItalic,
    fontSize: 14,
    lineHeight: 19,
  },

  planCard: {
    alignItems: 'center',
    paddingTop: 26,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(184,134,53,0.24)',
    backgroundColor: surfaces.card,
    overflow: 'hidden',
    ...shadows.floating,
  },
  planSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
  planSeal: { position: 'absolute', top: 12, right: 14, width: 34, height: 34, opacity: 0.9 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  planWhen: {
    flexShrink: 1,
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 17,
    lineHeight: 23,
    textAlign: 'center',
  },
  planThrough: {
    ...textStyles.caption,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
  },
  offerBoundary: {
    width: '100%',
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(190,111,124,0.22)',
    backgroundColor: surfaces.selected,
    alignItems: 'center',
    gap: 8,
  },
  offerIncluded: {
    ...textStyles.eyebrow,
    color: colors.roseText,
    fontSize: 9.5,
    letterSpacing: 1.25,
    textAlign: 'center',
  },
  offerDivider: {
    width: 54,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.lineStrong,
  },
  offerContinuation: {
    color: colors.paperInk,
    fontFamily: typography.monoMedium,
    fontSize: 9.5,
    lineHeight: 15,
    letterSpacing: 0.7,
    textAlign: 'center',
  },

  sheet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    maxWidth: 260,
  },
  sheetCell: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  sheetArt: { width: '100%', height: '100%' },
  sheetFuture: { opacity: 0.42 },
  sheetTonight: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: 'rgba(250,226,228,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  promises: { gap: 16 },
  promiseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  promiseCopy: { flex: 1, gap: 3 },
  promiseLabel: {
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 16,
    lineHeight: 21,
  },
  promiseBody: {
    ...textStyles.bodySmall,
    fontSize: 14,
    lineHeight: 21,
  },

  note: {
    padding: 20,
    paddingTop: 26,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(184,134,53,0.22)',
    backgroundColor: surfaces.paper,
    overflow: 'hidden',
  },
  noteFlowers: { position: 'absolute', top: -10, right: -12, width: 74, height: 74, opacity: 0.5 },
  noteBody: {
    color: colors.paperInk,
    fontFamily: typography.serifItalic,
    fontSize: 16,
    lineHeight: 26,
  },
  noteSign: {
    color: colors.roseText,
    fontFamily: typography.serifItalic,
    fontSize: 15,
    marginTop: 12,
    fontWeight: weight.medium,
  },

  footer: { gap: 12, alignItems: 'center', marginTop: 4 },
});
