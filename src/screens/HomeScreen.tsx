import { useEffect, useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Cloud, CloudOff, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { NightStrip } from '@/components/NightStrip';
import { Screen, Stagger } from '@/components/Screen';
import { Sparkle } from '@/components/Sparkle';
import { addLocalDays, localDateKey, readDateKey } from '@/domain/calendar';
import { formatDuration, formatLongDate, formatMonth } from '@/domain/format';
import { formatVoiceTime, isRecorded, totalVoiceSeconds } from '@/domain/stats';
import type { ReflectionReadiness } from '@/domain/conversion';
import { keepsakeDecorations } from '@/data/keepsakeAssets';
import { loadCommerceProducts } from '@/services/commerce';
import { colors, gradients, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import type { Night, PurchaseVerification } from '@/types';

type HomeProps = {
  nights: Night[];
  recordedCount: number;
  currentNight: Night;
  targetLength: 7 | 30 | 90;
  accessThrough: number;
  accessTier: 'trial' | 'paid30' | 'paid90';
  authState: 'local' | 'anonymous' | 'authenticated';
  syncing?: boolean;
  processingConsent: boolean;
  demoMode?: 'empty' | 'partial' | 'complete';
  readiness: ReflectionReadiness;
  purchaseVerification?: PurchaseVerification;
  newlyEarned?: number;
  reminderHour: number;
  reminderMinute: number;
  onQuestion: () => void;
  onSettings: () => void;
  onPaywall: () => void;
  onReportSetup: () => void;
  onReport: () => void;
};

function formatClock(hour: number, minute: number) {
  const h12 = ((hour + 11) % 12) + 1;
  const suffix = hour < 12 ? 'AM' : 'PM';
  return minute ? `${h12}:${String(minute).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export function HomeScreen({
  nights, recordedCount, currentNight, targetLength, accessThrough, accessTier, authState, syncing, processingConsent, demoMode,
  readiness, purchaseVerification, newlyEarned, reminderHour, reminderMinute, onQuestion, onSettings, onPaywall,
  onReportSetup, onReport,
}: HomeProps) {
  const [detail, setDetail] = useState<Night | null>(null);
  const [boardHeight, setBoardHeight] = useState(0);
  /** The sealed plate's timing, shown only when asked for. */
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  // A slow clock so the anticipation copy and the dusk dress stay current
  // without the screen ever visibly ticking.
  const [now, setNow] = useState(() => new Date());
  const [offerPrice, setOfferPrice] = useState<string>();
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  // The page falls into dusk once the quiet hour has passed (and stays there
  // through the small hours) — the app knows what time it is.
  const dusk = now.getHours() >= reminderHour || now.getHours() < 5;

  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const deviceWidth = Math.min(width, 520);
  const usableHeight = Math.max(1, height - insets.top - insets.bottom);
  const journeyTotal = accessTier === 'trial' ? 30 : targetLength;

  // Re-tuned so a normal phone gets the full-fidelity layout. The old
  // thresholds (860 / 700) put every mainstream device into "compact".
  const compact = usableHeight < 680 || deviceWidth < 360 || fontScale > 1.2;
  const dense = usableHeight < 580 || deviceWidth < 330 || fontScale > 1.6;
  // NightStrip's labels respect Dynamic Type. Let the already-scrollable Home
  // page grow with them instead of forcing a large caption stack into the old
  // fixed 244-point dense frame (which overlapped the statistics at 200–300%).
  const baseBoardBudget = dense ? 244 : compact ? 292 : Math.min(390, Math.round(usableHeight * 0.44));
  const scaledBoardFloor = Math.min(390, Math.round(244 + Math.max(0, fontScale - 1) * 44));
  const boardBudget = Math.max(baseBoardBudget, scaledBoardFloor);

  // The strip scrolls the whole chapter, so the thirty-night pager the board
  // needed is gone: there is nothing left to page between.
  const chapterNights = nights.slice(0, targetLength);

  const chapterClosed = chapterNights
    .every((night) => night.status === 'sealed' || night.status === 'revealed' || night.status === 'missed');
  const trialEnded = accessTier === 'trial' && chapterClosed;
  const canRecord = !demoMode && currentNight.status === 'today' && !trialEnded && !chapterClosed;

  const unbackedCount = nights.filter((night) => isRecorded(night) && !night.backedUp).length;
  const missedCount = nights.filter((night) => night.status === 'missed').length;
  const sealedToday = currentNight.status === 'sealed' || currentNight.status === 'revealed';

  useEffect(() => {
    if (!trialEnded) return;
    loadCommerceProducts()
      .then((products) => setOfferPrice(products.find((product) => product.plan === 'paid30')?.localizedPrice))
      .catch(() => undefined);
  }, [trialEnded]);

  const status = demoMode
    ? { tone: colors.brassText, icon: CloudOff, copy: 'Developer preview · cloud backup is off.' }
    : unbackedCount
    ? { tone: colors.brassText, icon: CloudOff, copy: `${unbackedCount} ${unbackedCount === 1 ? 'night is' : 'nights are'} waiting to back up.` }
    : syncing
      ? { tone: colors.brassText, icon: RefreshCw, copy: 'Tucking everything away…' }
      : missedCount
        ? { tone: colors.boneDim, icon: Cloud, copy: `Up to date · ${missedCount} ${missedCount === 1 ? 'night' : 'nights'} gently unfilled.` }
        : { tone: colors.mossText, icon: Cloud, copy: 'Your keepsake is up to date.' };

  const card = useMemo(() => {
    // The three states that ask for something keep the fuller note: they carry a
    // call to action, and the sentence under the label is what justifies it.
    if (demoMode) return {
      variant: 'note' as const,
      label: 'Developer preview · local only',
      copy: 'This visual preview is detached from your real journey. Recording and cloud backup are turned off here.',
      action: onSettings,
      cta: 'Open preview settings',
      art: 'journal' as const,
    };
    if (purchaseVerification) return {
      variant: 'note' as const,
      label: 'Purchase received',
      copy: purchaseVerification.status === 'pending-approval'
        ? 'Approval is pending. Nights 8–30 open automatically when the store confirms it—do not purchase again.'
        : 'We are finishing your nights 8–30 access. This status is safe to close.',
      action: onPaywall,
      cta: 'Check purchase status',
      art: 'journal' as const,
    };
    if (trialEnded) return {
      variant: 'note' as const,
      label: 'Night 8 is next · locked',
      copy: `Unlock nights 8–30 and your full night-30 reflection${offerPrice ? ` for ${offerPrice} once` : ' with one payment'}. Nothing renews.`,
      action: onPaywall,
      cta: offerPrice ? `Unlock nights 8–30 — ${offerPrice}` : 'Unlock nights 8–30',
      art: 'journal' as const,
    };
    if (chapterClosed) return { variant: 'note' as const, label: 'This chapter is complete', copy: 'Your next collection is ready whenever you are.', action: onPaywall, cta: 'Begin the next thirty', art: 'journal' as const };
    if (canRecord) return { variant: 'note' as const, label: "Tonight's question", copy: 'A sealed question is waiting for you.', action: onQuestion, cta: 'Open tonight’s letter', art: 'seal' as const };
    // A night unlocks on its date and stays open for the whole of it — the
    // chosen hour only decides when the reminder arrives. The old copy said
    // "opens at 9 PM tonight" with a countdown to that hour, which described a
    // lock the app has never had, and would have read as broken to anyone who
    // opened the app at 9:05 expecting something to have changed.
    const clock = formatClock(reminderHour, reminderMinute);
    const opensOn = currentNight.expectedLocalDate;
    const soon = opensOn === addLocalDays(localDateKey(now), 1) ? 'tomorrow' : `on ${formatLongDate(readDateKey(opensOn))}`;
    const reminder = `Your reminder is set for ${clock}, but the question stays open all day — answer whenever suits.`;

    // `currentNight` is only ever sealed when there is no later night to move on
    // to — `nextCurrentNight` prefers today, then the next unlocked future night,
    // and falls back to the last one. So reaching here means the run is done.
    if (sealedToday) {
      return {
        variant: 'sealed' as const,
        label: 'Tonight’s question',
        title: 'Answered and kept',
        detail: 'That was the last night available in this chapter.',
        art: 'seal' as const,
      };
    }
    return {
      variant: 'sealed' as const,
      label: 'Your next question',
      title: 'Still sealed',
      detail: `Night ${currentNight.index} opens ${soon}. ${reminder}`,
      art: 'seal' as const,
    };
  }, [canRecord, chapterClosed, currentNight.expectedLocalDate, currentNight.index, currentNight.status, demoMode, now, offerPrice, onPaywall, onQuestion, onSettings, purchaseVerification, reminderHour, reminderMinute, sealedToday, targetLength, trialEnded]);

  const reflectionCard = useMemo(() => {
    if (demoMode) return null;
    if (!readiness.recordedCount) return null;
    const firstReflection = readiness.checkpoint === 7;
    const reflectionLabel = firstReflection ? 'Your first reflection' : `Your night-${readiness.checkpoint} reflection`;
    if (readiness.state === 'ready') return {
      label: `${reflectionLabel} is ready`,
      copy: `${firstReflection ? 'Seven' : readiness.checkpoint} nights have become something you can read and hear.`,
      cta: 'Open reflection',
      action: onReport,
      tone: 'ready' as const,
    };
    if (readiness.state === 'processing') return {
      label: `${reflectionLabel} is taking shape`,
      copy: 'Processing continues safely if you close the app.',
      cta: 'View progress',
      action: onReport,
      tone: 'ready' as const,
    };
    if (readiness.state === 'prepared') return {
      label: firstReflection && readiness.recordedCount === 6
        ? 'Your first reflection arrives tomorrow'
        : `${reflectionLabel} is prepared`,
      copy: `${readiness.backedUpCount} ${readiness.backedUpCount === 1 ? 'night is' : 'nights are'} securely ready.`,
      cta: 'Review setup',
      action: onReportSetup,
      tone: 'ready' as const,
    };
    if (readiness.state === 'failed') return {
      label: `${reflectionLabel} needs attention`,
      copy: 'Your recordings remain safe. Open the checkpoint to retry.',
      cta: 'Open checkpoint',
      action: onReport,
      tone: 'attention' as const,
    };
    const step = authState !== 'authenticated'
      ? 'Create an account'
      : !processingConsent
        ? 'Processing permission is still needed'
        : readiness.state === 'attention'
          ? 'A backup needs another try'
          : `${readiness.unbackedCount} ${readiness.unbackedCount === 1 ? 'night is' : 'nights are'} waiting to back up`;
    return {
      label: `${reflectionLabel} needs setup`,
      copy: `${readiness.recordedCount} ${readiness.recordedCount === 1 ? 'night saved' : 'nights saved'} on this phone · ${step}.`,
      cta: 'Finish setup',
      action: onReportSetup,
      tone: 'attention' as const,
    };
  }, [authState, demoMode, onReport, onReportSetup, processingConsent, readiness]);

  const closeSheet = () => {
    setDetail(null);
    setNotice(null);
  };

  const measureBoard = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (Math.abs(next - boardHeight) > 1) setBoardHeight(next);
  };

  const handleNight = (night: Night) => {
    if (night.status === 'today' && canRecord) return onQuestion();
    setDetail(night);
  };

  return (
    <Screen tabbed variant={dusk ? 'dusk' : 'day'} contentStyle={[styles.screen, dense && styles.denseScreen]}>
      <Stagger index={0}>
        <AppHeader
          compact={compact}
          label={`NIGHT ${Math.min(currentNight.index, accessThrough)} OF ${journeyTotal}`}
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
        <View style={[styles.boardFrame, { height: boardBudget }]} onLayout={measureBoard}>
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
            <Text style={styles.statValue}>{Math.max(0, journeyTotal - recordedCount)}</Text>
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
        {canRecord ? null : card.variant === 'sealed' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${card.label}. ${card.title}.`}
            accessibilityHint="Shows when it opens"
            onPress={() => setNotice({ title: `${card.label}: ${card.title.toLowerCase()}`, body: card.detail })}
            style={({ pressed }) => [styles.cardWrap, pressed && styles.questionPressed]}
          >
            {/* Wax pressed onto the plate's top edge, half on and half off. */}
            <Image
              source={keepsakeDecorations.waxSeal}
              resizeMode="contain"
              accessibilityElementsHidden
              style={[styles.cardSealArt, compact && styles.compactCardSealArt]}
            />
            <View style={[styles.sealedPlate, compact && styles.compactSealedPlate]}>
              {/* Letterpress, the same trick the night cards' wells use: a soft
                  fall of shade from the top edge so the plate reads as pressed
                  into the page rather than laid on top of it. */}
              <LinearGradient
                colors={['rgba(102,67,80,0.07)', 'rgba(102,67,80,0)']}
                style={styles.sealedPress}
                pointerEvents="none"
              />
              <View style={styles.sealedFrame} pointerEvents="none" />
              <Text numberOfLines={1} style={styles.questionLabel}>{card.label.toUpperCase()}</Text>
              <View style={styles.sealedTitleRow}>
                <Sparkle size={10} color={colors.brass} />
                <Text numberOfLines={1} adjustsFontSizeToFit style={styles.sealedTitle}>{card.title}</Text>
                <Sparkle size={10} color={colors.brass} />
              </View>
            </View>
          </Pressable>
        ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${card.label}. ${card.copy}`}
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
          <View style={[styles.questionCard, compact && styles.compactQuestionCard]}>
          <LinearGradient colors={gradients.cardSheen} style={styles.cardSheen} pointerEvents="none" />
          <View style={styles.questionCopy}>
            <Text numberOfLines={2} style={styles.questionLabel}>{card.label}</Text>
            <Text
              style={[styles.questionText, compact && styles.compactQuestionText, dense && styles.denseQuestionText]}
            >
              {card.copy}
            </Text>
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

      {reflectionCard ? (
        <Stagger index={4}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${reflectionCard.label}. ${reflectionCard.copy}. ${reflectionCard.cta}`}
            onPress={reflectionCard.action}
            style={({ pressed }) => [
              styles.readinessCard,
              reflectionCard.tone === 'ready' ? styles.readinessReady : styles.readinessAttention,
              pressed && styles.questionPressed,
            ]}
          >
            <View style={styles.readinessIcon}>
              {reflectionCard.tone === 'ready'
                ? <Cloud size={17} strokeWidth={2} color={colors.mossText} />
                : <CloudOff size={17} strokeWidth={2} color={colors.brassText} />}
            </View>
            <View style={styles.readinessCopy}>
              <Text style={styles.readinessTitle}>{reflectionCard.label}</Text>
              <Text style={styles.readinessBody}>{reflectionCard.copy}</Text>
              <View style={styles.readinessCtaRow}>
                <Text style={styles.readinessCta}>{reflectionCard.cta}</Text>
                <ChevronRight size={14} strokeWidth={2.4} color={colors.roseText} />
              </View>
            </View>
          </Pressable>
        </Stagger>
      ) : null}

      <Stagger index={5}>
        <View style={styles.statusRow}>
          <status.icon size={15} strokeWidth={1.9} color={status.tone} />
          <Text style={[styles.status, { color: status.tone }]}>{status.copy}</Text>
        </View>
      </Stagger>

      {/* One sheet serves both a tapped night and the plate's timing; two
          would race each other for the same screen. */}
      <BottomSheet
        visible={Boolean(detail) || Boolean(notice)}
        title={detail ? nightSheetTitle(detail) : notice?.title ?? ''}
        body={detail ? nightSheetBody(detail) : notice?.body}
        actions={[{ label: 'Alright', variant: 'outline', onPress: closeSheet }]}
        onClose={closeSheet}
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
    const backup = !night.backedUp ? ' It is still waiting to back up.' : '';
    return `Recorded on ${date}.${length} It stays tucked away until its next reflection checkpoint, then joins your Gallery.${backup}`;
  }
  if (night.status === 'revealed') {
    const length = night.durationSec ? ` ${formatDuration(night.durationSec)} of voice.` : '';
    return `Recorded on ${date}.${length} You can play this one back from the Gallery.`;
  }
  return `This question opens on ${date || 'its scheduled evening'}, at the hour you chose.`;
}

const styles = StyleSheet.create({
  // The gap is multiplied by four rows, so it is the single biggest lever on
  // what is left for the board. At 14 the strip was squeezed until its art hit
  // the 76pt floor in NightStrip and the mount letterboxed around a sticker too
  // small to read — which is the one thing the strip exists to prevent.
  screen: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 16,
    gap: 12,
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
    // 60 still clears Fraunces' descenders at this size; 66 was buying a second
    // line's worth of air above a heading that only ever runs to one.
    lineHeight: 60,
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
    justifyContent: 'center',
  },
  boardFrame: {
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: 'center',
  },
  /** The chapter stated once, in numbers the heading above does not already
   *  give: minutes of voice, and how much of the story is still ahead. */
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
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

  /** The waiting state: a wax-sealed plate naming the night it holds, and
   *  nothing else. Roughly half the height of the note it replaced, which is
   *  the space the sticker above it needed.
   *
   *  The first pass drew an envelope flap — a hairline straight across the top —
   *  and it landed exactly on the eyebrow, reading as text struck through. The
   *  plate says "sealed" through the wax and the gilt frame instead, with
   *  nothing crossing the copy. */
  sealedPlate: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    // The seal is 54 tall and hangs 27 over the edge, so anything under 30 here
    // puts the eyebrow against the wax. 38 clears it and lets the plate breathe.
    paddingTop: 38,
    paddingBottom: 22,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: surfaces.cardSoft,
    overflow: 'hidden',
    ...shadows.soft,
    shadowOpacity: 0.08,
  },
  compactSealedPlate: {
    paddingHorizontal: 18,
    paddingTop: 32,
    paddingBottom: 16,
  },
  sealedPress: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 58,
  },
  /** An inset gilt hairline, the way a keepsake plate is framed. Held clear of
   *  the copy on every side, so it frames rather than crosses. */
  sealedFrame: {
    position: 'absolute',
    top: 7,
    left: 7,
    right: 7,
    bottom: 7,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(184,134,53,0.22)',
  },
  sealedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  sealedTitle: {
    // Bounded so `adjustsFontSizeToFit` has something to shrink against — a row
    // child sizes to its content otherwise and the prop does nothing.
    flexShrink: 1,
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 23,
    lineHeight: 30,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  // A sealed note, not a notification. The seal overlaps the top edge, the
  // surface is the softer paper rather than the bright card, and the shadow is
  // light so the sticker board above stays the hero of the screen.
  questionCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    // The seal overlaps this edge by 27, so the top padding only has to clear
    // the half that lands on the paper — 30 was clearing the whole seal twice.
    paddingTop: 24,
    paddingBottom: 14,
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
    width: '100%',
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
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 3,
    marginTop: 4,
  },
  cta: {
    minWidth: 0,
    flexShrink: 1,
    color: colors.roseText,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 13,
    letterSpacing: 0.2,
    textAlign: 'center',
  },

  readinessCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 15,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  readinessReady: {
    backgroundColor: surfaces.success,
    borderColor: 'rgba(90,116,98,0.25)',
  },
  readinessAttention: {
    backgroundColor: '#FFF8EB',
    borderColor: 'rgba(184,134,53,0.28)',
  },
  readinessIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  readinessCopy: { flex: 1, minWidth: 0 },
  readinessTitle: {
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 16,
    lineHeight: 21,
  },
  readinessBody: {
    ...textStyles.caption,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 3,
  },
  readinessCtaRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 7 },
  readinessCta: {
    minWidth: 0,
    flexShrink: 1,
    color: colors.roseText,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 13,
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
