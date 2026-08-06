import { useEffect, useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Clock, Cloud, CloudOff, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { NightStrip } from '@/components/NightStrip';
import { Screen, Stagger } from '@/components/Screen';
import { Sparkle } from '@/components/Sparkle';
import { formatDuration, formatMonth } from '@/domain/format';
import { formatVoiceTime, totalVoiceSeconds } from '@/domain/stats';
import { keepsakeDecorations } from '@/data/keepsakeAssets';
import { colors, gradients, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import type { Night } from '@/types';

type HomeProps = {
  nights: Night[];
  recordedCount: number;
  currentNight: Night;
  targetLength: 7 | 30 | 90;
  accessThrough: number;
  accessTier: 'trial' | 'paid30' | 'paid90';
  authState: 'local' | 'anonymous' | 'authenticated';
  syncing?: boolean;
  newlyEarned?: number;
  reminderHour: number;
  reminderMinute: number;
  onQuestion: () => void;
  onSettings: () => void;
  onPaywall: () => void;
};

function formatClock(hour: number, minute: number) {
  const h12 = ((hour + 11) % 12) + 1;
  const suffix = hour < 12 ? 'AM' : 'PM';
  return minute ? `${h12}:${String(minute).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

/** The next time the quiet hour comes around, from a given moment. */
function nextQuietHour(from: Date, hour: number, minute: number) {
  const target = new Date(from);
  target.setHours(hour, minute, 0, 0);
  if (target <= from) target.setDate(target.getDate() + 1);
  return target;
}

function formatWait(ms: number) {
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  if (!minutes) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${hours}h ${minutes}m`;
}

export function HomeScreen({
  nights, recordedCount, currentNight, targetLength, accessThrough, accessTier, authState, syncing, newlyEarned,
  reminderHour, reminderMinute, onQuestion, onSettings, onPaywall,
}: HomeProps) {
  const [detail, setDetail] = useState<Night | null>(null);
  const [boardHeight, setBoardHeight] = useState(0);
  // A slow clock so the anticipation copy and the dusk dress stay current
  // without the screen ever visibly ticking.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  // The page falls into dusk once the quiet hour has passed (and stays there
  // through the small hours) — the app knows what time it is.
  const dusk = now.getHours() >= reminderHour || now.getHours() < 5;

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const deviceWidth = Math.min(width, 520);
  const usableHeight = Math.max(1, height - insets.top - insets.bottom);

  // Re-tuned so a normal phone gets the full-fidelity layout. The old
  // thresholds (860 / 700) put every mainstream device into "compact".
  const compact = usableHeight < 680 || deviceWidth < 360;
  const dense = usableHeight < 580 || deviceWidth < 330;

  // The strip scrolls the whole chapter, so the thirty-night pager the board
  // needed is gone: there is nothing left to page between.
  const chapterNights = nights.slice(0, targetLength);

  const chapterClosed = chapterNights
    .every((night) => night.status === 'sealed' || night.status === 'revealed' || night.status === 'missed');
  const trialEnded = accessTier === 'trial' && chapterClosed;
  const canRecord = currentNight.status === 'today' && !trialEnded && !chapterClosed;

  const unbackedCount = nights.filter((night) => night.backedUp === false).length;
  const missedCount = nights.filter((night) => night.status === 'missed').length;
  const sealedToday = currentNight.status === 'sealed' || currentNight.status === 'revealed';

  const status = unbackedCount
    ? { tone: colors.brassText, icon: CloudOff, copy: `${unbackedCount} ${unbackedCount === 1 ? 'night is' : 'nights are'} waiting to back up.` }
    : syncing
      ? { tone: colors.brassText, icon: RefreshCw, copy: 'Tucking everything away…' }
      : missedCount
        ? { tone: colors.boneDim, icon: Cloud, copy: `Up to date · ${missedCount} ${missedCount === 1 ? 'night' : 'nights'} gently unfilled.` }
        : { tone: colors.mossText, icon: Cloud, copy: 'Your keepsake is up to date.' };

  const card = useMemo(() => {
    if (trialEnded) return { label: 'Continue your keepsake', copy: 'Your first seven nights are safe. Choose how long the story continues.', arrival: undefined, wait: undefined, action: onPaywall, cta: 'See the chapters', art: 'journal' as const };
    if (chapterClosed) return { label: 'This chapter is complete', copy: 'Your next collection is ready whenever you are.', arrival: undefined, wait: undefined, action: onPaywall, cta: 'Begin the next thirty', art: 'journal' as const };
    if (canRecord) return { label: "Tonight's question", copy: 'A sealed question is waiting for you.', arrival: undefined, wait: undefined, action: onQuestion, cta: 'Open tonight’s letter', art: 'seal' as const };
    // "Tonight's question ... tomorrow" contradicted itself. The letter is only
    // "tonight's" while tonight can still deliver it; past the hour it is the
    // next one.
    const arrival = nextQuietHour(now, reminderHour, reminderMinute);
    const clock = formatClock(reminderHour, reminderMinute);
    const wait = formatWait(arrival.getTime() - now.getTime());
    const tonight = arrival.getDate() === now.getDate();
    if (sealedToday) {
      const nextIndex = currentNight.index + 1;
      return {
        label: 'Sealed for tonight',
        copy: 'Your answer is tucked away.',
        arrival: nextIndex <= targetLength ? `Night ${nextIndex} opens at ${clock} tomorrow` : undefined,
        wait: nextIndex <= targetLength ? wait : undefined,
        action: undefined,
        cta: undefined,
        art: 'seal' as const,
      };
    }
    return {
      label: 'A letter is on its way',
      copy: tonight ? 'Tonight’s question is still sealed.' : 'Your next question is still sealed.',
      arrival: `Opens at ${clock} ${tonight ? 'tonight' : 'tomorrow'}`,
      wait,
      action: undefined,
      cta: undefined,
      art: 'seal' as const,
    };
  }, [canRecord, chapterClosed, currentNight.index, now, onPaywall, onQuestion, reminderHour, reminderMinute, sealedToday, targetLength, trialEnded]);

  const measureBoard = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (Math.abs(next - boardHeight) > 1) setBoardHeight(next);
  };

  const handleNight = (night: Night) => {
    if (night.status === 'today' && canRecord) return onQuestion();
    setDetail(night);
  };

  return (
    <Screen scroll={false} tabbed variant={dusk ? 'dusk' : 'day'} contentStyle={[styles.screen, dense && styles.denseScreen]}>
      <Stagger index={0}>
        <AppHeader
          compact={compact}
          label={`NIGHT ${Math.min(currentNight.index, accessThrough)} OF ${targetLength}`}
          onSettings={onSettings}
        />
      </Stagger>

      <Stagger index={1}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.month, compact && styles.compactMonth, dense && styles.denseMonth]}
            >
              {formatMonth(new Date())}
            </Text>
            <View style={styles.progressRow}>
              <Sparkle size={9} color={colors.brass} twinkle />
              <Text numberOfLines={1} style={styles.progress}>
                {recordedCount} {recordedCount === 1 ? 'night kept' : 'nights kept'}
              </Text>
            </View>
          </View>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={syncing ? 'Synchronizing' : authState === 'authenticated' ? 'Cloud identity connected' : 'Saved on this device'}
            style={[styles.identitySeal, authState === 'authenticated' && styles.connectedSeal]}
          >
            <Cloud
              size={16}
              strokeWidth={1.9}
              color={syncing ? colors.brassText : authState === 'authenticated' ? colors.mossText : colors.boneFaint}
            />
          </View>
        </View>
      </Stagger>

      {/* One night at a time, large enough to actually see. The thirty-window
          board lives in the Gallery now; at six columns every sticker was drawn
          around 45px and none of the artwork could be read. The strip scrolls
          the whole chapter and opens on tonight, so nothing is lost — and the
          spine beneath it keeps the sense of a sheet filling up. */}
      <Stagger index={2} style={styles.boardSlot}>
        {/* The frame is `flex: 1`, so its height comes from what is left on the
            screen and never from the strip inside it — measuring it here cannot
            feed back into itself. The strip needs the number: without it the
            cards were silently squashed and clipped their own last line. */}
        <View style={styles.boardFrame} onLayout={measureBoard}>
          <NightStrip
            nights={chapterNights}
            canRecord={canRecord}
            newlyEarned={newlyEarned}
            onPressNight={handleNight}
            onRecord={onQuestion}
            compact={compact}
            dense={dense}
            maxHeight={boardHeight || undefined}
          />
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatVoiceTime(totalVoiceSeconds(chapterNights))}</Text>
            <Text style={styles.statLabel}>of your voice</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{Math.max(0, targetLength - recordedCount)}</Text>
            <Text style={styles.statLabel}>nights ahead</Text>
          </View>
        </View>
      </Stagger>

      {/* When tonight is yours to record, the strip's own card is the call to
          action and this note would only repeat it — two cards saying "tonight
          is ready" and neither reading as the thing to press. The note earns its
          place when there is nothing to do: the wait is the hook that brings
          someone back tomorrow. */}
      <Stagger index={3}>
        {canRecord ? null : (
        <Pressable
          accessibilityRole={card.action ? 'button' : 'summary'}
          accessibilityLabel={`${card.label}. ${card.copy}`}
          accessibilityState={{ disabled: !card.action }}
          disabled={!card.action}
          onPress={card.action}
          style={({ pressed }) => [styles.cardWrap, pressed && styles.questionPressed]}
        >
          {/* The seal presses onto the top edge of the note, the way it does on
              the question paper — the card reads as something sealed rather
              than as a notification with an icon inside it. */}
          <Image
            source={card.art === 'seal' ? keepsakeDecorations.waxSeal : keepsakeDecorations.journal}
            resizeMode="contain"
            accessibilityElementsHidden
            style={[
              card.art === 'seal' ? styles.cardSealArt : styles.journal,
              compact && (card.art === 'seal' ? styles.compactCardSealArt : styles.compactJournal),
            ]}
          />
          <View style={[
            styles.questionCard,
            compact && styles.compactQuestionCard,
            !card.action && styles.questionResting,
          ]}>
          <LinearGradient colors={gradients.cardSheen} style={styles.cardSheen} pointerEvents="none" />
          <View style={styles.questionCopy}>
            <Text numberOfLines={2} style={styles.questionLabel}>{card.label}</Text>
            <Text
              numberOfLines={compact ? 3 : 4}
              style={[styles.questionText, compact && styles.compactQuestionText, dense && styles.denseQuestionText]}
            >
              {card.copy}
            </Text>
            {/* When the letter is still coming, the arrival and the wait are
                two separate facts and are given their own lines. */}
            {card.arrival ? (
              <View style={styles.arrivalBlock}>
                <View style={styles.arrivalRule} />
                <View style={styles.arrivalRow}>
                  <Clock size={13} strokeWidth={2} color={colors.paperDim} />
                  <Text numberOfLines={1} style={styles.arrivalWhen}>{card.arrival}</Text>
                </View>
                {card.wait ? <Text style={styles.arrivalWait}>{card.wait} from now</Text> : null}
              </View>
            ) : null}
            {card.cta ? (
              <View style={styles.ctaRow}>
                <Text style={styles.cta}>{card.cta}</Text>
                <ChevronRight size={15} strokeWidth={2.4} color={colors.roseText} />
              </View>
            ) : null}
          </View>
          </View>
        </Pressable>
        )}
      </Stagger>

      <Stagger index={4}>
        <View style={styles.statusRow}>
          <status.icon size={15} strokeWidth={1.9} color={status.tone} />
          <Text numberOfLines={2} style={[styles.status, { color: status.tone }]}>{status.copy}</Text>
        </View>
      </Stagger>

      <BottomSheet
        visible={Boolean(detail)}
        title={detail ? nightSheetTitle(detail) : ''}
        body={detail ? nightSheetBody(detail) : undefined}
        actions={[{ label: 'Alright', variant: 'outline', onPress: () => setDetail(null) }]}
        onClose={() => setDetail(null)}
      />
    </Screen>
  );
}

function nightSheetTitle(night: Night) {
  if (night.status === 'missed') return `Night ${night.index} stayed empty.`;
  if (night.status === 'revealed') return `Night ${night.index} is open.`;
  if (night.status === 'sealed') return `Night ${night.index} is sealed.`;
  return `Night ${night.index} hasn't arrived.`;
}

function nightSheetBody(night: Night) {
  const date = night.expectedLocalDate;
  if (night.status === 'missed') {
    return `${date} came and went without a recording. Missed nights can't be filled in later — that's what keeps the collection honest. The thread picks up again tonight.`;
  }
  if (night.status === 'sealed') {
    const length = night.durationSec ? ` It runs ${formatDuration(night.durationSec)}.` : '';
    const backup = night.backedUp === false ? ' It is still waiting to back up.' : '';
    return `Recorded on ${date}.${length} It stays tucked away until its next reflection checkpoint, then joins your Gallery.${backup}`;
  }
  if (night.status === 'revealed') {
    const length = night.durationSec ? ` ${formatDuration(night.durationSec)} of voice.` : '';
    return `Recorded on ${date}.${length} You can play this one back from the Gallery.`;
  }
  return `This question opens on ${date || 'its scheduled evening'}, at the hour you chose.`;
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 22,
    gap: 14,
  },
  denseScreen: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  headingCopy: {
    flex: 1,
  },
  // Line heights leave room for Fraunces' deep descenders — a tighter box
  // clipped the tail of August's "g" against the row below on web.
  month: {
    color: colors.bone,
    fontFamily: typography.serifSemiBold,
    fontSize: 52,
    lineHeight: 66,
    letterSpacing: -1.8,
  },
  compactMonth: {
    fontSize: 42,
    lineHeight: 54,
  },
  denseMonth: {
    fontSize: 34,
    lineHeight: 44,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
  },
  // Sentence case, serif italic: a written aside, not another shouted label.
  // The mono-uppercase register is reserved for the night counter above.
  progress: {
    color: colors.paperDim,
    fontFamily: typography.serifItalic,
    fontSize: 15,
    lineHeight: 20,
  },
  identitySeal: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: surfaces.card,
    marginBottom: 4,
  },
  connectedSeal: {
    borderColor: 'rgba(90,116,98,0.34)',
    backgroundColor: surfaces.success,
  },

  // Must be allowed to *shrink*, not just grow. With a hard minHeight the board
  // kept its size when the note below grew and pushed the navigation off the
  // bottom of the screen.
  boardSlot: {
    flex: 1,
    flexShrink: 1,
    minHeight: 0,
    justifyContent: 'center',
  },
  boardFrame: {
    flex: 1,
    justifyContent: 'center',
  },
  /** The chapter stated once, in numbers the heading above does not already
   *  give: minutes of voice, and how much of the story is still ahead. */
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.line,
  },
  statValue: {
    color: colors.bone,
    fontFamily: typography.serifSemiBold,
    fontSize: 22,
  },
  statLabel: {
    ...textStyles.caption,
    marginTop: 2,
  },

  /** Holds the seal and the note it is pressed onto. */
  cardWrap: {
    alignItems: 'center',
  },
  // A sealed note, not a notification. The seal overlaps the top edge, the
  // surface is the softer paper rather than the bright card, and the shadow is
  // light so the sticker board above stays the hero of the screen.
  questionCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 18,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: surfaces.cardSoft,
    overflow: 'hidden',
    ...shadows.soft,
    shadowOpacity: 0.08,
  },
  compactQuestionCard: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 14,
    gap: 6,
  },
  cardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 64,
  },
  questionResting: {
    backgroundColor: surfaces.cardSoft,
    borderColor: colors.line,
    borderStyle: 'dashed',
    shadowOpacity: 0.05,
    elevation: 1,
  },
  questionPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.94,
  },
  journal: {
    width: 46,
    height: 61,
    marginBottom: -26,
    zIndex: 1,
  },
  compactJournal: {
    width: 38,
    height: 50,
    marginBottom: -21,
    zIndex: 1,
  },
  // Half on the note, half off it. zIndex keeps it above the card's surface.
  cardSealArt: {
    width: 54,
    height: 54,
    marginBottom: -27,
    zIndex: 1,
  },
  compactCardSealArt: {
    width: 44,
    height: 44,
    marginBottom: -22,
    zIndex: 1,
  },
  // Capped so centred lines stay a readable measure instead of stretching the
  // full width of the card and reading as loose, floating text.
  questionCopy: {
    alignSelf: 'center',
    alignItems: 'center',
    maxWidth: 300,
    gap: 6,
  },
  questionLabel: {
    ...textStyles.eyebrow,
    fontSize: 10,
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  questionText: {
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 21,
    lineHeight: 28,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  compactQuestionText: {
    fontSize: 20,
    lineHeight: 25,
  },
  denseQuestionText: {
    fontSize: 17,
    lineHeight: 22,
  },
  arrivalBlock: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 8,
    gap: 5,
  },
  // A short centred rule. A full-width one cut the little note in half.
  arrivalRule: {
    width: 34,
    height: 1,
    backgroundColor: colors.lineStrong,
    marginBottom: 8,
  },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  arrivalWhen: {
    flexShrink: 1,
    color: colors.bone,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 14,
  },
  arrivalWait: {
    color: colors.paperDim,
    fontFamily: typography.mono,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginTop: 4,
  },
  cta: {
    color: colors.roseText,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 13,
    letterSpacing: 0.2,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 8,
  },
  status: {
    // `flex: 0` collapsed this to min-content on web and broke the line apart.
    flexShrink: 1,
    fontFamily: typography.sans,
    fontWeight: weight.medium,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },

});
