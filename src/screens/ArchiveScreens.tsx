import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Lock } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { Screen, Stagger } from '@/components/Screen';
import { Sparkle } from '@/components/Sparkle';
import { WindowGrid } from '@/components/WindowGrid';
import { keepsakeDecorations } from '@/data/keepsakeAssets';
import { localDateKey } from '@/domain/calendar';
import { deviceLocale, formatDuration, formatLongDate, reportStatusLabel } from '@/domain/format';
import { chapterTitle, completionRate, formatVoiceTime, isRecorded, recordedDateMap, streaks, totalVoiceSeconds } from '@/domain/stats';
import { colors, gradients, hourSweep, hueForHour, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
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

export function GalleryScreen({ current, completed, reports, onSettings, onReport, onPlayNight }: {
  current: Chapter;
  completed: Chapter[];
  reports: Report[];
  onSettings: () => void;
  onReport: (reportId: string, chapterId: string) => void;
  onPlayNight: (chapter: Chapter, night: Night) => void;
}) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 520) - 48;
  // A two-column keepsake shelf becomes illegible on narrow phones. Let each
  // cover breathe there, then switch to two columns once both can remain wide.
  const coverWidth = contentWidth < 390 ? contentWidth : Math.min(230, (contentWidth - 16) / 2);
  const recorded = current.nights.filter(isRecorded).length;
  const chapterReports = reports
    .filter((report) => report.chapterId === current.id)
    .sort((a, b) => a.checkpointNight - b.checkpointNight);

  // No back arrow and no segmented toggle: the tab bar below is now the one
  // place this app changes rooms, and two navigations competing for the same
  // job is what made the old bottom of these screens feel bolted on.
  return (
    <Screen tabbed header={<AppHeader onSettings={onSettings} />}>
      <Stagger index={0}>
        <Text accessibilityRole="header" style={styles.title}>Gallery</Text>
      </Stagger>

      <Stagger index={2}>
        <View style={styles.currentCard}>
          <LinearGradient colors={gradients.cardSheen} style={styles.currentSheen} pointerEvents="none" />
          <Text style={styles.currentEyebrow}>The chapter you are in</Text>
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
          <Text style={styles.sectionLabel}>Report checkpoints</Text>
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
        <Text style={styles.sectionLabel}>Kept chapters</Text>
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
            // A faint mark, not a filled tile. Full-size grey squares in every
            // unrecorded slot turned the year into a wall of disabled UI and
            // buried the handful of nights that are actually lit.
            const dot = Math.max(3, Math.round(cell * (isToday ? 0.52 : 0.34)));
            return (
              <View key={index} style={[styles.cellSlot, { width: cell, height: cell }]}>
                <View
                  style={[
                    styles.emptyCell,
                    { width: dot, height: dot, borderRadius: dot / 2 },
                    isToday && styles.todayCell,
                  ]}
                />
              </View>
            );
          }
          const [from, to] = hueForHour(night.recordedHour ?? 22);
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`${formatLongDate(date)}, night ${night.index} recorded`}
              onPress={() => onPickNight(night, date)}
              hitSlop={3}
              style={({ pressed }) => [pressed && styles.pressedCell]}
            >
              <LinearGradient
                colors={[from, to]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.litCell, { width: cell, height: cell, borderRadius: Math.max(3, cell * 0.32) }]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function LightMapScreen({ chapters, onSettings }: {
  chapters: Chapter[];
  onSettings: () => void;
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

  // Only the months that can actually hold light: from the first recorded
  // night of this year through the current month. A wall of ten empty grids
  // for months that cannot contain data read as a dead screen.
  const currentMonth = new Date().getMonth();
  const visibleMonths = useMemo(() => {
    const withData: number[] = [];
    recordedByDate.forEach((_, key) => {
      if (key.startsWith(`${year}-`)) withData.push(Number(key.slice(5, 7)) - 1);
    });
    const first = Math.min(currentMonth, ...withData);
    const last = Math.max(currentMonth, ...withData);
    return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
  }, [currentMonth, recordedByDate, year]);

  return (
    <Screen tabbed header={<AppHeader onSettings={onSettings} />}>
      <Stagger index={0}>
        <Text accessibilityRole="header" style={styles.title}>Light Map</Text>
      </Stagger>

      <Stagger index={2}>
        <View style={styles.statsCard}>
          <LinearGradient colors={gradients.cardSheen} style={styles.currentSheen} pointerEvents="none" />
          {/* Minutes of voice is the number that matters — it is the keepsake
              itself. Streaks and completion only appear once they mean
              something; "Completion 100%" beside an empty year read as false. */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{formatVoiceTime(totalVoiceSeconds(nights))}</Text>
              <Text style={styles.statLabel}>of your voice, kept</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{recorded.length}</Text>
              <Text style={styles.statLabel}>{recorded.length === 1 ? 'night recorded' : 'nights recorded'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{streak.current}</Text>
              <Text style={styles.statLabel}>{streak.current === 1 ? 'night running' : 'nights running'}</Text>
            </View>
          </View>
          {streak.longest > 1 || completedChapters > 0 || recorded.length >= 7 ? (
            <View style={styles.secondaryStats}>
              {streak.longest > 1 ? (
                <Text style={styles.secondary}>Longest run <Text style={styles.secondaryValue}>{streak.longest}</Text></Text>
              ) : null}
              {completedChapters > 0 ? (
                <Text style={styles.secondary}>Kept chapters <Text style={styles.secondaryValue}>{completedChapters}</Text></Text>
              ) : null}
              {recorded.length >= 7 ? (
                <Text style={styles.secondary}>Completion <Text style={styles.secondaryValue}>{completionRate(nights)}%</Text></Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Stagger>

      <Stagger index={3}>
        <View style={styles.yearHeader}>
          <Text accessibilityRole="header" style={styles.year}>{year}</Text>
          <Text style={styles.yearHint}>Every night you kept, lit by the hour you spoke — the later, the deeper.</Text>
        </View>

        {recorded.length ? (
          <View style={styles.monthGridWrap}>
            {visibleMonths.map((month) => (
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
        {/* One sweep, three words. Seven separate swatches asked you to memorise
            a colour key nobody ever needed: the only thing the colour says is
            how late it was, and a continuous ramp says that on its own. */}
        <Text style={styles.sectionLabel}>The hours</Text>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="Colour scale: early evening is candlelight gold, midnight is deep plum, dawn lifts back to blush."
        >
          <LinearGradient
            colors={hourSweep}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.legendSweep}
          />
          <View style={styles.legendLabels}>
            <Text style={styles.legendLabel}>Early evening</Text>
            <Text style={styles.legendLabel}>Midnight</Text>
            <Text style={styles.legendLabel}>Dawn</Text>
          </View>
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
  // Written asides, not shouted kickers — the mono-uppercase register is
  // reserved for the night counter in the app header.
  sectionLabel: {
    color: colors.paperDim,
    fontFamily: typography.serifItalic,
    fontSize: 17,
    marginTop: 28,
    marginBottom: 12,
  },
  pressedRow: { opacity: 0.62 },

  currentCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    backgroundColor: surfaces.card,
    padding: 20,
    overflow: 'hidden',
    ...shadows.floating,
  },
  currentSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
  currentEyebrow: { color: colors.paperDim, fontFamily: typography.serifItalic, fontSize: 15 },
  currentMonth: {
    ...textStyles.heading,
    marginTop: 6,
    marginBottom: 16,
  },
  currentBoard: {
    borderRadius: radii.lg,
    backgroundColor: surfaces.cardSoft,
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
    backgroundColor: surfaces.card,
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
    justifyContent: 'center',
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
    backgroundColor: surfaces.cardSoft,
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
    backgroundColor: surfaces.cardSoft,
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
    backgroundColor: surfaces.card,
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
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: 12,
    rowGap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 14,
    marginTop: 16,
  },
  secondary: { ...textStyles.caption, color: colors.boneDim, flexGrow: 1, textAlign: 'center' },
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
  // Album leaves, in the same warm paper as the rest of the app. Bright white
  // panels on cream made the map look like a chart pasted over the page.
  monthCard: {
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: surfaces.paper,
    borderWidth: 1,
    borderColor: 'rgba(184,134,53,0.16)',
  },
  monthLabel: {
    color: colors.brassText,
    fontFamily: typography.monoMedium,
    fontSize: 10,
    letterSpacing: 1.9,
    textTransform: 'uppercase',
    marginBottom: 9,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  cellSlot: { alignItems: 'center', justifyContent: 'center' },
  emptyCell: { backgroundColor: 'rgba(102,67,80,0.12)' },
  todayCell: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.rose },
  // A hairline of paper light around each lit night, so the colour reads as a
  // mark set into the page rather than a flat swatch printed on it.
  litCell: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,253,249,0.55)' },
  pressedCell: { opacity: 0.6, transform: [{ scale: 0.88 }] },

  legendSweep: { height: 10, borderRadius: 999 },
  legendLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  legendLabel: { ...textStyles.caption, fontSize: 11, color: colors.boneDim },
});
