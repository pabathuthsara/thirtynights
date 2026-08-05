import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Lock } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { Screen, Stagger } from '@/components/Screen';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { Sparkle } from '@/components/Sparkle';
import { WindowGrid } from '@/components/WindowGrid';
import { keepsakeDecorations } from '@/data/keepsakeAssets';
import { localDateKey } from '@/domain/calendar';
import { deviceLocale, formatDuration, formatLongDate, reportStatusLabel } from '@/domain/format';
import { chapterTitle, completionRate, formatVoiceTime, isRecorded, recordedDateMap, streaks, totalVoiceSeconds } from '@/domain/stats';
import { colors, gradients, hourRamp, hueForHour, radii, shadows, textStyles, typography, weight } from '@/theme';
import type { Chapter, Night, Report } from '@/types';

/* ------------------------------------------------------------------ Gallery */

/** A completed chapter reads as a keepsake cover, not a colour swatch. */
function ChapterCover({ chapter, reports, width, onReport, onPlayNight }: {
  chapter: Chapter;
  reports: Report[];
  width: number;
  onReport: (reportId: string, chapterId: string) => void;
  onPlayNight: (chapter: Chapter, night: Night) => void;
}) {
  const recorded = chapter.nights.filter(isRecorded).length;
  const chapterReports = reports.filter((report) => report.chapterId === chapter.id);
  const ready = chapterReports.filter((report) => report.status === 'ready');
  const open = Boolean(chapter.completedAt);

  return (
    <View style={[styles.cover, { width }]}>
      <LinearGradient colors={['#FFFDF9', '#F6E7E0']} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={gradients.cardSheen} style={styles.coverSheen} pointerEvents="none" />
      <View style={styles.coverBoard}>
        <WindowGrid
          nights={chapter.nights.slice(0, 30)}
          onPressNight={(night) => night.status === 'revealed' && onPlayNight(chapter, night)}
          maxWidth={width - 34}
          dense
          padToSheet={chapter.targetLength > 7}
        />
      </View>
      <View style={styles.coverFoot}>
        <Text numberOfLines={1} style={styles.coverTitle}>{chapterTitle(chapter)}</Text>
        <Text style={styles.coverMeta}>
          {recorded} {recorded === 1 ? 'night' : 'nights'} · {formatVoiceTime(totalVoiceSeconds(chapter.nights))}
        </Text>
      </View>
      {ready.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open the night ${ready[0]!.checkpointNight} report`}
          onPress={() => onReport(ready[0]!.id, chapter.id)}
          style={({ pressed }) => [styles.coverAction, pressed && styles.pressedRow]}
        >
          <Sparkle size={11} color={colors.brass} />
          <Text style={styles.coverActionLabel}>
            {ready.length > 1 ? `${ready.length} reports` : `Night ${ready[0]!.checkpointNight} report`}
          </Text>
          <ChevronRight size={15} strokeWidth={2.2} color={colors.roseText} />
        </Pressable>
      ) : (
        <View style={styles.coverAction}>
          <Lock size={12} strokeWidth={2} color={colors.boneFaint} />
          <Text style={styles.coverLocked}>{open ? 'Reflection pending' : 'Still being kept'}</Text>
        </View>
      )}
      <Image
        source={keepsakeDecorations.washiTape}
        resizeMode="contain"
        accessibilityElementsHidden
        style={styles.coverTape}
      />
    </View>
  );
}

export function GalleryScreen({ current, completed, reports, onBack, onSettings, onLightMap, onReport, onPlayNight }: {
  current: Chapter;
  completed: Chapter[];
  reports: Report[];
  onBack: () => void;
  onSettings: () => void;
  onLightMap: () => void;
  onReport: (reportId: string, chapterId: string) => void;
  onPlayNight: (chapter: Chapter, night: Night) => void;
}) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 520) - 48;
  const coverWidth = Math.min(230, (contentWidth - 16) / 2);
  const recorded = current.nights.filter(isRecorded).length;
  const chapterReports = reports
    .filter((report) => report.chapterId === current.id)
    .sort((a, b) => a.checkpointNight - b.checkpointNight);

  return (
    <Screen header={<AppHeader onBack={onBack} onSettings={onSettings} />}>
      <Stagger index={0}>
        <Text accessibilityRole="header" style={styles.title}>Gallery</Text>
      </Stagger>
      <Stagger index={1}>
        <SegmentedTabs value="windows" onChange={(value) => value === 'light-map' && onLightMap()} />
      </Stagger>

      <Stagger index={2}>
        <View style={styles.currentCard}>
          <LinearGradient colors={gradients.cardSheen} style={styles.currentSheen} pointerEvents="none" />
          <Text style={styles.currentEyebrow}>THE CHAPTER YOU ARE IN</Text>
          <Text style={styles.currentMonth}>{chapterTitle(current)}</Text>
          <View style={styles.currentBoard}>
            <WindowGrid
              nights={current.nights.slice(0, 30)}
              onPressNight={(night) => night.status === 'revealed' && onPlayNight(current, night)}
              maxWidth={contentWidth - 40}
              padToSheet={current.targetLength > 7}
            />
          </View>
          <View style={styles.currentStats}>
            <View style={styles.currentStat}>
              <Text style={styles.currentStatValue}>{recorded}</Text>
              <Text style={styles.currentStatLabel}>of {current.targetLength} nights</Text>
            </View>
            <View style={styles.currentDivider} />
            <View style={styles.currentStat}>
              <Text style={styles.currentStatValue}>{formatVoiceTime(totalVoiceSeconds(current.nights))}</Text>
              <Text style={styles.currentStatLabel}>of your voice</Text>
            </View>
          </View>
        </View>
      </Stagger>

      {chapterReports.length ? (
        <Stagger index={3}>
          <Text style={styles.sectionLabel}>REPORT CHECKPOINTS</Text>
          <View style={styles.shelf}>
            {chapterReports.map((report, index) => (
              <Pressable
                key={report.id}
                accessibilityRole="button"
                accessibilityLabel={`Night ${report.checkpointNight} report, ${reportStatusLabel(report.status)}`}
                onPress={() => onReport(report.id, current.id)}
                style={({ pressed }) => [
                  styles.shelfRow,
                  index === chapterReports.length - 1 && styles.lastRow,
                  pressed && styles.pressedRow,
                ]}
              >
                <View style={[styles.shelfDot, report.status === 'ready' && styles.shelfDotReady]} />
                <Text style={styles.shelfNight}>Night {report.checkpointNight}</Text>
                <Text style={[styles.shelfStatus, report.status === 'ready' && styles.shelfStatusReady]}>
                  {reportStatusLabel(report.status)}
                </Text>
                <ChevronRight size={16} strokeWidth={2} color={colors.boneFaint} />
              </Pressable>
            ))}
          </View>
        </Stagger>
      ) : null}

      <Stagger index={4}>
        <Text style={styles.sectionLabel}>KEPT CHAPTERS</Text>
        {completed.length ? (
          <View style={styles.coverGrid}>
            {completed.map((chapter) => (
              <ChapterCover
                key={chapter.id}
                chapter={chapter}
                reports={reports}
                width={coverWidth}
                onReport={onReport}
                onPlayNight={onPlayNight}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Image source={keepsakeDecorations.driedFlowers} resizeMode="contain" accessibilityElementsHidden style={styles.emptyArt} />
            <Text style={styles.emptyTitle}>Your first cover is still being made.</Text>
            <Text style={styles.emptyBody}>
              When this chapter closes it settles here as a keepsake you can open again. No sample months are shown.
            </Text>
          </View>
        )}
      </Stagger>
    </Screen>
  );
}

/* ----------------------------------------------------------------- LightMap */

const WEEKDAY_START = 0; // Sunday-first, matching Date.getDay().

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() - WEEKDAY_START + 7) % 7;
  const days = new Date(year, month + 1, 0, 12).getDate();
  const cells: (Date | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(new Date(year, month, day, 12));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function MonthCard({ year, month, size, recordedByDate, onPickNight }: {
  year: number;
  month: number;
  size: number;
  recordedByDate: Map<string, Night>;
  onPickNight: (night: Night, date: Date) => void;
}) {
  const cells = useMemo(() => monthMatrix(year, month), [month, year]);
  const label = useMemo(
    () => new Intl.DateTimeFormat(deviceLocale(), { month: 'short' }).format(new Date(year, month, 1)),
    [month, year],
  );
  const cell = (size - 6 * 3) / 7;
  const today = localDateKey();

  return (
    <View style={[styles.monthCard, { width: size + 20 }]}>
      <Text style={styles.monthLabel}>{label.toUpperCase()}</Text>
      <View style={[styles.monthGrid, { width: size }]}>
        {cells.map((date, index) => {
          if (!date) return <View key={index} style={{ width: cell, height: cell }} />;
          const key = localDateKey(date);
          const night = recordedByDate.get(key);
          const isToday = key === today;
          if (!night) {
            return (
              <View
                key={index}
                style={[
                  styles.emptyCell,
                  { width: cell, height: cell, borderRadius: Math.max(3, cell * 0.3) },
                  isToday && styles.todayCell,
                ]}
              />
            );
          }
          const [from, to] = hueForHour(night.recordedHour ?? 22);
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`${formatLongDate(date)}, night ${night.index} recorded`}
              onPress={() => onPickNight(night, date)}
              style={({ pressed }) => [pressed && styles.pressedCell]}
            >
              <LinearGradient
                colors={[from, to]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: cell, height: cell, borderRadius: Math.max(3, cell * 0.3) }}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function LightMapScreen({ chapters, onBack, onSettings, onGallery }: {
  chapters: Chapter[];
  onBack: () => void;
  onSettings: () => void;
  onGallery: () => void;
}) {
  const { width } = useWindowDimensions();
  const [picked, setPicked] = useState<{ night: Night; date: Date } | null>(null);
  const year = new Date().getFullYear();
  const nights = useMemo(() => chapters.flatMap((chapter) => chapter.nights), [chapters]);
  const recorded = nights.filter(isRecorded);
  const recordedByDate = useMemo(() => recordedDateMap(nights), [nights]);
  const streak = streaks(nights);
  const completedChapters = chapters.filter((chapter) => Boolean(chapter.completedAt)).length;

  const contentWidth = Math.min(width, 520) - 48;
  // Two months per row, weekday-aligned. The old view was 365 dots at 6px in
  // rows of 53 consecutive days — no weekday alignment and nothing readable.
  const monthSize = Math.floor((contentWidth - 12) / 2) - 20;

  return (
    <Screen header={<AppHeader onBack={onBack} onSettings={onSettings} />}>
      <Stagger index={0}>
        <Text accessibilityRole="header" style={styles.title}>Light Map</Text>
      </Stagger>
      <Stagger index={1}>
        <SegmentedTabs value="light-map" onChange={(value) => value === 'windows' && onGallery()} />
      </Stagger>

      <Stagger index={2}>
        <View style={styles.statsCard}>
          <LinearGradient colors={gradients.cardSheen} style={styles.currentSheen} pointerEvents="none" />
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{recorded.length}</Text>
              <Text style={styles.statLabel}>recorded nights</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{completedChapters}</Text>
              <Text style={styles.statLabel}>kept chapters</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{formatVoiceTime(totalVoiceSeconds(nights))}</Text>
              <Text style={styles.statLabel}>of voice</Text>
            </View>
          </View>
          <View style={styles.secondaryStats}>
            <Text style={styles.secondary}>Current streak <Text style={styles.secondaryValue}>{streak.current}</Text></Text>
            <Text style={styles.secondary}>Longest <Text style={styles.secondaryValue}>{streak.longest}</Text></Text>
            <Text style={styles.secondary}>Completion <Text style={styles.secondaryValue}>{completionRate(nights)}%</Text></Text>
          </View>
        </View>
      </Stagger>

      <Stagger index={3}>
        <View style={styles.yearHeader}>
          <Text accessibilityRole="header" style={styles.year}>{year}</Text>
          <Text style={styles.yearHint}>Colour follows the hour you spoke.</Text>
        </View>

        {recorded.length ? (
          <View style={styles.monthGridWrap}>
            {Array.from({ length: 12 }, (_, month) => (
              <MonthCard
                key={month}
                year={year}
                month={month}
                size={monthSize}
                recordedByDate={recordedByDate}
                onPickNight={(night, date) => setPicked({ night, date })}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Sparkle size={22} color={colors.brass} twinkle />
            <Text style={styles.emptyTitle}>Your first sealed night will light this map.</Text>
            <Text style={styles.emptyBody}>
              Every recording places one warm mark on the year, tinted by the hour you spoke.
            </Text>
          </View>
        )}
      </Stagger>

      <Stagger index={4}>
        {/* The legend now follows `hourRamp`, which is the same ordering
            `hueForHour` actually uses. The old legend printed the raw array. */}
        <Text style={styles.sectionLabel}>THE HOURS</Text>
        <View style={styles.legend}>
          {hourRamp.map((band) => (
            <View key={band.label} style={styles.legendItem}>
              <LinearGradient
                colors={[band.color[0], band.color[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.legendSwatch}
              />
              <Text style={styles.legendLabel}>{band.label}</Text>
            </View>
          ))}
        </View>
      </Stagger>

      <BottomSheet
        visible={Boolean(picked)}
        title={picked ? `Night ${picked.night.index}` : ''}
        body={picked
          ? `${formatLongDate(picked.date)}${picked.night.durationSec ? ` · ${formatDuration(picked.night.durationSec)}` : ''}. ${
            picked.night.status === 'revealed' ? 'This one has been revealed — you can play it from the Gallery.' : 'Still sealed until its reflection checkpoint.'
          }`
          : undefined}
        actions={[{ label: 'Close', variant: 'outline', onPress: () => setPicked(null) }]}
        onClose={() => setPicked(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...textStyles.title, marginBottom: 20 },
  sectionLabel: { ...textStyles.eyebrow, fontSize: 11, marginTop: 28, marginBottom: 12 },
  pressedRow: { opacity: 0.62 },

  currentCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    backgroundColor: 'rgba(255,253,249,0.9)',
    padding: 20,
    overflow: 'hidden',
    ...shadows.floating,
  },
  currentSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
  currentEyebrow: { ...textStyles.eyebrow, fontSize: 10 },
  currentMonth: {
    ...textStyles.heading,
    marginTop: 6,
    marginBottom: 16,
  },
  currentBoard: {
    borderRadius: radii.lg,
    backgroundColor: 'rgba(250,242,234,0.8)',
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 16,
    alignItems: 'center',
  },
  currentStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  currentStat: { flex: 1, alignItems: 'center' },
  currentDivider: { width: 1, height: 30, backgroundColor: colors.line },
  currentStatValue: { color: colors.bone, fontFamily: typography.serifSemiBold, fontSize: 23 },
  currentStatLabel: { ...textStyles.caption, marginTop: 3 },

  shelf: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,253,249,0.86)',
    ...shadows.soft,
    shadowOpacity: 0.07,
  },
  shelfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  lastRow: { borderBottomWidth: 0 },
  shelfDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lineStrong },
  shelfDotReady: { backgroundColor: colors.moss },
  shelfNight: { flex: 1, color: colors.bone, fontFamily: typography.serifMedium, fontSize: 16 },
  shelfStatus: { ...textStyles.caption, color: colors.boneFaint },
  shelfStatusReady: { color: colors.mossText, fontWeight: weight.semibold },

  coverGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  cover: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
    paddingTop: 18,
    paddingBottom: 12,
    paddingHorizontal: 10,
    ...shadows.floating,
    shadowOpacity: 0.13,
  },
  coverSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 60 },
  coverBoard: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: 'rgba(251,243,234,0.86)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  coverFoot: { marginTop: 12, paddingHorizontal: 4 },
  coverTitle: { color: colors.bone, fontFamily: typography.serifSemiBold, fontSize: 17 },
  coverMeta: { ...textStyles.caption, marginTop: 3 },
  coverAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 4,
    minHeight: 34,
  },
  coverActionLabel: { flex: 1, color: colors.roseText, fontFamily: typography.sans, fontWeight: weight.semibold, fontSize: 13 },
  coverLocked: { ...textStyles.caption, color: colors.boneFaint },
  coverTape: {
    position: 'absolute',
    width: 74,
    height: 30,
    top: -8,
    right: 16,
    opacity: 0.9,
    transform: [{ rotate: '6deg' }],
  },

  emptyCard: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 34,
    paddingHorizontal: 26,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,253,249,0.5)',
  },
  emptyArt: { width: 92, height: 92, opacity: 0.9 },
  emptyTitle: {
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 18,
    lineHeight: 25,
    textAlign: 'center',
  },
  emptyBody: { ...textStyles.bodySmall, fontSize: 14, textAlign: 'center', maxWidth: 300 },

  statsCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    backgroundColor: 'rgba(255,253,249,0.9)',
    padding: 20,
    overflow: 'hidden',
    ...shadows.floating,
    shadowOpacity: 0.12,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 34, backgroundColor: colors.line },
  statNumber: { color: colors.bone, fontFamily: typography.serifSemiBold, fontSize: 26 },
  statLabel: { ...textStyles.caption, marginTop: 4, textAlign: 'center' },
  secondaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 14,
    marginTop: 16,
  },
  secondary: { ...textStyles.caption, color: colors.boneDim },
  secondaryValue: { color: colors.bone, fontWeight: weight.bold },

  yearHeader: { marginTop: 30, marginBottom: 16 },
  year: { color: colors.bone, fontFamily: typography.serifSemiBold, fontSize: 32, letterSpacing: -0.8 },
  yearHint: { ...textStyles.caption, marginTop: 4 },

  monthGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 18,
  },
  monthCard: {
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,253,249,0.68)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  monthLabel: { ...textStyles.eyebrow, fontSize: 10, letterSpacing: 1.6, marginBottom: 9 },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  emptyCell: { backgroundColor: 'rgba(118,82,99,0.09)' },
  todayCell: { borderWidth: 1, borderColor: colors.rose, backgroundColor: 'rgba(190,111,124,0.14)' },
  pressedCell: { opacity: 0.6, transform: [{ scale: 0.88 }] },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: { alignItems: 'center', gap: 5 },
  legendSwatch: { width: 30, height: 16, borderRadius: 6 },
  legendLabel: { ...textStyles.caption, fontSize: 11, color: colors.boneDim },
});
