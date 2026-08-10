import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { File } from 'expo-file-system';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AlertTriangle, Check, Pause, Play } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { Screen, Stagger } from '@/components/Screen';
import { localDateKey } from '@/domain/calendar';
import { formatDuration } from '@/domain/format';
import { signedRecordingUrl } from '@/lib/supabase';
import { colors, radii, surfaces, textStyles, typography, weight } from '@/theme';
import type { Chapter, Night } from '@/types';

/** What the file on disk actually says, as opposed to what the snapshot claims.
 *  A row where these disagree is the failure this screen exists to surface. */
type OnDisk = { exists: boolean; size: number } | { error: string } | undefined;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Development only: every recording the device knows about, with what is
 * actually on disk beside what the snapshot believes, and playback that ignores
 * the reveal rule.
 *
 * The product deliberately refuses to play a take back until it is revealed —
 * that is the whole "no playback until it has settled" promise — which also
 * means there is no supported way to confirm a recording captured anything at
 * all. This screen is that way, and it never ships: it is reachable only from
 * the developer section, which is itself behind `__DEV__`.
 */
export function DevRecordingsScreen({ chapters, onBack }: { chapters: Chapter[]; onBack: () => void }) {
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disk, setDisk] = useState<Record<string, OnDisk>>({});
  const mounted = useRef(true);
  const today = localDateKey();

  const rows = useMemo(
    () => chapters
      .flatMap((chapter) => chapter.nights.map((night) => ({ night, chapter })))
      .filter(({ night }) => night.recordedAt || night.localUri || night.storagePath)
      .sort((a, b) => b.night.index - a.night.index),
    [chapters],
  );

  // Stat every local file once. `byteSize` in the snapshot is what was written
  // at seal time; this is what survived, and a zero-byte or missing file is the
  // bug that would otherwise only appear as silence months later.
  useEffect(() => {
    let active = true;
    (async () => {
      const next: Record<string, OnDisk> = {};
      for (const { night } of rows) {
        if (!night.localUri) continue;
        try {
          const file = new File(night.localUri);
          next[night.id] = { exists: file.exists, size: file.exists ? file.size ?? 0 : 0 };
        } catch (cause) {
          next[night.id] = { error: cause instanceof Error ? cause.message : 'unreadable' };
        }
      }
      if (active) setDisk(next);
    })();
    return () => { active = false; };
  }, [rows]);

  // `useAudioPlayer` owns and releases its native shared object on unmount.
  // Calling `pause()` from another unmount cleanup races that release on iOS
  // and raises "Unable to find the native shared object". This flag only
  // prevents an outstanding signed-URL request from touching the released
  // player; Expo performs the actual player cleanup.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const toggle = async (night: Night) => {
    setError(null);
    if (playingId === night.id && status.playing) {
      player.pause();
      return;
    }
    try {
      const source = night.localUri ?? (night.storagePath ? await signedRecordingUrl(night.storagePath) : undefined);
      if (!source) throw new Error('No local file and no backup to stream.');
      if (!mounted.current) return;
      player.replace(source);
      player.play();
      setPlayingId(night.id);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not play this recording.');
    }
  };

  return (
    <Screen header={<AppHeader label="DEV · RECORDINGS" onBack={onBack} />}>
      {/* Why a night is locked is decided entirely by string comparison between
          `expectedLocalDate` and the device's own date key, so showing both
          side by side turns "the question won't open" from a guess into a
          reading. `unlocks` is the same comparison `reconcileChapter` makes. */}
      <Stagger index={0}>
        <Text accessibilityRole="header" style={styles.title}>Schedule</Text>
        <View style={styles.schedule}>
          <Text style={styles.meta}>device today · {today}</Text>
          {chapters.map((chapter) => (
            <View key={chapter.id} style={styles.scheduleChapter}>
              <Text style={styles.meta}>
                chapter {chapter.id.slice(0, 8)} · target {chapter.targetLength} · accessThrough {chapter.accessThrough}
              </Text>
              <Text style={styles.meta}>tz {chapter.timezone} · started {chapter.startedAt.slice(0, 10)}</Text>
              {chapter.nights.slice(0, 8).map((night) => {
                const unlocks = night.expectedLocalDate === today;
                const wrong = unlocks && night.status !== 'today' && !night.recordedAt;
                return (
                  <Text key={night.id} style={[styles.meta, wrong && styles.flag]}>
                    {String(night.index).padStart(2, '0')} · {night.expectedLocalDate} · {night.status}
                    {unlocks ? ' · DATE IS TODAY' : ''}
                    {wrong ? ' · EXPECTED today' : ''}
                  </Text>
                );
              })}
            </View>
          ))}
        </View>
      </Stagger>

      <Stagger index={0}>
        <Text accessibilityRole="header" style={styles.title}>Every take on this device</Text>
        <Text style={styles.body}>
          {rows.length} {rows.length === 1 ? 'recording' : 'recordings'}. Playback here ignores the reveal rule.
          “On disk” is what the file actually measures — if it disagrees with the sealed size, the capture failed.
        </Text>
      </Stagger>

      {error ? (
        <Stagger index={1}>
          <Text style={styles.error}>{error}</Text>
        </Stagger>
      ) : null}

      <Stagger index={2}>
        <ScrollView contentContainerStyle={styles.list}>
          {rows.length === 0 ? (
            <Text style={styles.body}>Nothing recorded yet. Seal a night and it will appear here.</Text>
          ) : rows.map(({ night }) => {
            const onDisk = disk[night.id];
            const sealed = night.byteSize ?? 0;
            const actual = onDisk && 'exists' in onDisk ? onDisk.size : undefined;
            // Only a claim that can be checked can be wrong: no sealed size
            // means nothing to disagree with, not a pass.
            const mismatch = actual !== undefined && sealed > 0 && Math.abs(actual - sealed) > 0;
            const missing = onDisk && 'exists' in onDisk && !onDisk.exists;
            const active = playingId === night.id && status.playing;

            return (
              <View key={night.id} style={styles.row}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>
                    Night {night.index} · {night.status}
                  </Text>
                  <Text style={styles.meta}>
                    {night.expectedLocalDate}
                    {night.durationSec ? ` · ${formatDuration(night.durationSec)}` : ' · no duration'}
                    {night.recordedHour !== undefined ? ` · recorded ${night.recordedHour}:00` : ''}
                  </Text>
                  <Text style={styles.meta}>
                    sealed {sealed ? formatBytes(sealed) : '—'}
                    {' · on disk '}
                    {onDisk === undefined ? (night.localUri ? 'checking…' : 'no local file')
                      : 'error' in onDisk ? onDisk.error
                        : onDisk.exists ? formatBytes(onDisk.size) : 'MISSING'}
                  </Text>
                  <Text style={styles.meta}>
                    {night.backupState ?? 'no backup state'}
                    {night.storagePath ? ' · uploaded' : ' · device only'}
                    {night.checksum ? ` · ${night.checksum.slice(0, 12)}…` : ' · no checksum'}
                  </Text>
                  {missing || mismatch ? (
                    <View style={styles.flagRow}>
                      <AlertTriangle size={13} strokeWidth={2} color={colors.brassText} />
                      <Text style={styles.flag}>
                        {missing ? 'File is gone from disk.' : `Size differs from sealed by ${formatBytes(Math.abs((actual ?? 0) - sealed))}.`}
                      </Text>
                    </View>
                  ) : actual !== undefined && actual > 0 ? (
                    <View style={styles.flagRow}>
                      <Check size={13} strokeWidth={2.4} color={colors.mossText} />
                      <Text style={styles.ok}>File present and matches.</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${active ? 'Pause' : 'Play'} night ${night.index}`}
                  onPress={() => void toggle(night)}
                  style={({ pressed }) => [styles.play, pressed && styles.playPressed]}
                >
                  {active
                    ? <Pause size={17} strokeWidth={2.2} color={colors.roseText} />
                    : <Play size={17} strokeWidth={2.2} color={colors.roseText} />}
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </Stagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...textStyles.title, marginBottom: 6 },
  body: { ...textStyles.body, marginBottom: 4 },
  error: { ...textStyles.body, color: colors.brassText },
  list: { gap: 10, paddingBottom: 24 },
  schedule: { gap: 3, padding: 12, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: surfaces.cardSoft, marginBottom: 8 },
  scheduleChapter: { gap: 3, marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: surfaces.card,
  },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { color: colors.bone, fontFamily: typography.serifSemiBold, fontSize: 16 },
  meta: { color: colors.paperDim, fontFamily: typography.mono, fontSize: 11, lineHeight: 16 },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  flag: { color: colors.brassText, fontFamily: typography.sans, fontWeight: weight.semibold, fontSize: 12 },
  ok: { color: colors.mossText, fontFamily: typography.sans, fontSize: 12 },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: surfaces.cardSoft,
  },
  playPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
});
