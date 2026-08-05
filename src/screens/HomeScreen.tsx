import { useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, ChevronRight, Cloud, CloudOff, Grid3X3, Moon, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { Screen, Stagger } from '@/components/Screen';
import { Sparkle } from '@/components/Sparkle';
import { estimateGridHeight, WindowGrid } from '@/components/WindowGrid';
import { questionFor } from '@/data/questions';
import { formatDuration, formatMonth } from '@/domain/format';
import { keepsakeDecorations, keepsakeTextures } from '@/data/keepsakeAssets';
import { colors, gradients, HIT_TARGET, radii, shadows, textStyles, typography, weight } from '@/theme';
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
  onQuestion: () => void;
  onSettings: () => void;
  onGallery: () => void;
  onLightMap: () => void;
  onPaywall: () => void;
};

export function HomeScreen({
  nights, recordedCount, currentNight, targetLength, accessThrough, accessTier, authState, syncing, newlyEarned,
  onQuestion, onSettings, onGallery, onLightMap, onPaywall,
}: HomeProps) {
  const [detail, setDetail] = useState<Night | null>(null);
  const [board, setBoard] = useState({ width: 0, height: 0 });

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const deviceWidth = Math.min(width, 520);
  const usableHeight = Math.max(1, height - insets.top - insets.bottom);

  // Re-tuned so a normal phone gets the full-fidelity layout. The old
  // thresholds (860 / 700) put every mainstream device into "compact".
  const compact = usableHeight < 680 || deviceWidth < 360;
  const dense = usableHeight < 580 || deviceWidth < 330;

  const chapterSegments = Math.max(1, Math.ceil(targetLength / 30));
  const currentSegment = Math.min(chapterSegments - 1, Math.floor((Math.max(1, currentNight.index) - 1) / 30));
  const [segment, setSegment] = useState(currentSegment);
  const segmentStart = segment * 30;
  const segmentNights = nights.slice(segmentStart, segmentStart + 30);

  const chapterClosed = nights.slice(0, targetLength)
    .every((night) => night.status === 'sealed' || night.status === 'revealed' || night.status === 'missed');
  const trialEnded = accessTier === 'trial' && chapterClosed;
  const canRecord = currentNight.status === 'today' && !trialEnded && !chapterClosed;
  const viewingCurrentSegment = segment === currentSegment;

  const set = currentNight.questionId.startsWith('set_b') ? 'set_b'
    : currentNight.questionId.startsWith('set_c') ? 'set_c' : 'set_a';
  const question = questionFor(set, currentNight.index);

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
    if (trialEnded) return { label: 'Continue your keepsake', copy: 'Your first seven nights are safe. Choose how long the story continues.', action: onPaywall, cta: 'See the chapters' };
    if (chapterClosed) return { label: 'This chapter is complete', copy: 'Your next collection is ready whenever you are.', action: onPaywall, cta: 'Begin the next thirty' };
    if (canRecord) return { label: "Tonight's question", copy: question, action: onQuestion, cta: 'Answer tonight' };
    if (sealedToday) return { label: 'Sealed for tonight', copy: 'Your answer is tucked away. Come back tomorrow for the next question.', action: undefined, cta: undefined };
    return { label: 'Tonight is still closed', copy: 'Your next question appears at the quiet hour you chose.', action: undefined, cta: undefined };
  }, [canRecord, chapterClosed, onPaywall, onQuestion, question, sealedToday, trialEnded]);

  const handleNight = (night: Night) => {
    if (night.status === 'today' && canRecord) return onQuestion();
    setDetail(night);
  };

  const measureBoard = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    if (Math.abs(w - board.width) > 1 || Math.abs(h - board.height) > 1) setBoard({ width: w, height: h });
  };

  const boardInset = dense ? 14 : compact ? 20 : 26;
  const gridMaxWidth = Math.max(120, board.width - boardInset * 2);
  const gridMaxHeight = Math.max(120, board.height - boardInset * 2);
  // Derived from props, never from a measurement of the grid itself — that
  // would make the board's height depend on the grid whose height depends on
  // the board, which is an infinite layout loop.
  const boardCeiling = Math.max(
    208,
    estimateGridHeight({ count: segmentNights.length, dense, padToSheet: targetLength > 7 }) + boardInset * 2,
  );

  return (
    <Screen scroll={false} contentStyle={[styles.screen, dense && styles.denseScreen]}>
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
              <Sparkle size={9} color={colors.brass} />
              <Text style={styles.progress}>
                {recordedCount} {recordedCount === 1 ? 'NIGHT' : 'NIGHTS'} RECORDED
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

      {/* The frame absorbs whatever vertical space is left; the board sizes to
          the sheet it holds. Measuring the frame (not the board) keeps the
          grid's constraints independent of the grid's own height. */}
      <Stagger index={2} style={styles.boardSlot}>
        <View style={styles.boardFrame} onLayout={measureBoard}>
        <View style={[styles.board, { padding: boardInset, maxHeight: boardCeiling }]}>
          {/* The paper surface is a clipped layer of its own, so the decorations
              below can hang past the board's edge like taped-on objects instead
              of landing on top of a night. */}
          <View style={styles.boardSurface}>
            <Image
              source={keepsakeTextures.stickerBoard}
              resizeMode="cover"
              style={styles.boardTexture}
              accessibilityElementsHidden
            />
            <LinearGradient colors={gradients.cardSheen} style={styles.boardSheen} pointerEvents="none" />
          </View>

          {board.width > 0 ? (
            <WindowGrid
              nights={segmentNights}
              onPressNight={handleNight}
              dense={dense}
              maxWidth={gridMaxWidth}
              maxHeight={gridMaxHeight}
              padToSheet={targetLength > 7}
              newlyEarned={viewingCurrentSegment ? newlyEarned : undefined}
            />
          ) : null}

          {/* Hang off the board's corners, clear of the sticker area. */}
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.decorLayer}
          >
            <Image source={keepsakeDecorations.binderClip} resizeMode="contain" style={[styles.clip, dense && styles.denseClip]} />
            <Image source={keepsakeDecorations.tapedFlowers} resizeMode="contain" style={[styles.flower, dense && styles.denseFlower]} />
            <Image source={keepsakeDecorations.waxSeal} resizeMode="contain" style={[styles.waxSeal, dense && styles.denseWaxSeal]} />
          </View>
        </View>
        </View>

        {chapterSegments > 1 ? (
          <View style={styles.segmentBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous thirty nights"
              disabled={segment === 0}
              onPress={() => setSegment((value) => Math.max(0, value - 1))}
              hitSlop={10}
              style={({ pressed }) => [styles.segmentButton, segment === 0 && styles.segmentDisabled, pressed && styles.segmentPressed]}
            >
              <ChevronLeft size={18} strokeWidth={2} color={colors.roseText} />
            </Pressable>
            <Text style={styles.segmentLabel}>
              NIGHTS {segmentStart + 1}–{Math.min(targetLength, segmentStart + 30)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next thirty nights"
              disabled={segment >= chapterSegments - 1}
              onPress={() => setSegment((value) => Math.min(chapterSegments - 1, value + 1))}
              hitSlop={10}
              style={({ pressed }) => [styles.segmentButton, segment >= chapterSegments - 1 && styles.segmentDisabled, pressed && styles.segmentPressed]}
            >
              <ChevronRight size={18} strokeWidth={2} color={colors.roseText} />
            </Pressable>
          </View>
        ) : null}
      </Stagger>

      <Stagger index={3}>
        <Pressable
          accessibilityRole={card.action ? 'button' : 'summary'}
          accessibilityLabel={`${card.label}. ${card.copy}`}
          accessibilityState={{ disabled: !card.action }}
          disabled={!card.action}
          onPress={card.action}
          style={({ pressed }) => [
            styles.questionCard,
            compact && styles.compactQuestionCard,
            !card.action && styles.questionResting,
            pressed && styles.questionPressed,
          ]}
        >
          <LinearGradient colors={gradients.cardSheen} style={styles.cardSheen} pointerEvents="none" />
          <Image
            source={keepsakeDecorations.journal}
            resizeMode="contain"
            accessibilityElementsHidden
            style={[styles.journal, compact && styles.compactJournal]}
          />
          <View style={styles.questionCopy}>
            <Text numberOfLines={1} style={styles.questionLabel}>{card.label}</Text>
            <Text
              numberOfLines={compact ? 3 : 4}
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
        </Pressable>
      </Stagger>

      <Stagger index={4}>
        <View style={styles.statusRow}>
          <status.icon size={15} strokeWidth={1.9} color={status.tone} />
          <Text numberOfLines={2} style={[styles.status, { color: status.tone }]}>{status.copy}</Text>
        </View>
      </Stagger>

      <Stagger index={5}>
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Gallery"
            onPress={onGallery}
            android_ripple={{ color: 'rgba(190,111,124,0.14)', borderless: false }}
            style={({ pressed }) => [styles.navButton, pressed && styles.navPressed]}
          >
            <Grid3X3 size={20} strokeWidth={1.9} color={colors.roseText} />
            <Text style={styles.navLabel}>Gallery</Text>
          </Pressable>
          <View style={styles.navDivider} />
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Light Map"
            onPress={onLightMap}
            android_ripple={{ color: 'rgba(190,111,124,0.14)', borderless: false }}
            style={({ pressed }) => [styles.navButton, pressed && styles.navPressed]}
          >
            <Moon size={20} strokeWidth={1.9} color={colors.roseText} />
            <Text style={styles.navLabel}>Light Map</Text>
          </Pressable>
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
    paddingBottom: 10,
    gap: 12,
  },
  denseScreen: {
    paddingHorizontal: 14,
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
  month: {
    color: colors.bone,
    fontFamily: typography.serifSemiBold,
    fontSize: 52,
    lineHeight: 58,
    letterSpacing: -1.8,
  },
  compactMonth: {
    fontSize: 42,
    lineHeight: 48,
  },
  denseMonth: {
    fontSize: 34,
    lineHeight: 39,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
  },
  progress: {
    ...textStyles.eyebrow,
    fontSize: 11,
    letterSpacing: 1.8,
  },
  identitySeal: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,253,249,0.78)',
    marginBottom: 4,
  },
  connectedSeal: {
    borderColor: 'rgba(90,116,98,0.34)',
    backgroundColor: 'rgba(240,246,241,0.9)',
  },

  boardSlot: {
    flex: 1,
    minHeight: 190,
    justifyContent: 'center',
  },
  boardFrame: {
    flex: 1,
    justifyContent: 'center',
  },
  board: {
    minHeight: 208,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  boardSurface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#FBF3EA',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    ...shadows.lifted,
  },
  boardTexture: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.55,
  },
  boardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '38%',
  },
  decorLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Decorations live in the corners, fully inside the board, and clear of the
  // sticker band so they never sit on top of a night.
  clip: {
    position: 'absolute',
    width: 54,
    height: 54,
    left: -12,
    top: -20,
  },
  denseClip: { width: 40, height: 40, left: -8, top: -14 },
  flower: {
    position: 'absolute',
    width: 82,
    height: 100,
    right: -6,
    top: -26,
  },
  denseFlower: { width: 58, height: 72, right: -4, top: -18 },
  waxSeal: {
    position: 'absolute',
    width: 54,
    height: 54,
    right: -14,
    bottom: -16,
  },
  denseWaxSeal: { width: 40, height: 40, right: -10, bottom: -12 },

  segmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 8,
  },
  segmentButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,249,0.86)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  segmentDisabled: { opacity: 0.34 },
  segmentPressed: { opacity: 0.6 },
  segmentLabel: {
    ...textStyles.eyebrow,
    fontSize: 11,
    minWidth: 120,
    textAlign: 'center',
  },

  questionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    backgroundColor: 'rgba(255,253,249,0.94)',
    overflow: 'hidden',
    ...shadows.floating,
  },
  compactQuestionCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  cardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 64,
  },
  questionResting: {
    backgroundColor: 'rgba(250,243,237,0.82)',
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
    width: 62,
    height: 82,
  },
  compactJournal: {
    width: 46,
    height: 62,
  },
  questionCopy: {
    flex: 1,
    gap: 6,
  },
  questionLabel: {
    ...textStyles.eyebrow,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  questionText: {
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 23,
    lineHeight: 29,
    letterSpacing: -0.3,
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
    gap: 3,
    marginTop: 2,
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

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    backgroundColor: 'rgba(255,253,249,0.9)',
    overflow: 'hidden',
    ...shadows.floating,
    shadowOpacity: 0.12,
  },
  navButton: {
    flex: 1,
    minHeight: HIT_TARGET + 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  navPressed: {
    opacity: 0.55,
  },
  navLabel: {
    color: colors.bone,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 15,
  },
  navDivider: {
    height: 26,
    width: 1,
    backgroundColor: colors.line,
  },
});
