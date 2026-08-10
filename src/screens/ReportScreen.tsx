import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Pause, Play, Quote, RotateCcw, Share2 } from 'lucide-react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Buttons';
import { Screen, Stagger } from '@/components/Screen';
import { Sparkle } from '@/components/Sparkle';
import { Waveform } from '@/components/Waveform';
import { WindowGrid } from '@/components/WindowGrid';
import { chapterTitle, isRecorded, totalVoiceSeconds } from '@/domain/stats';
import { formatDuration } from '@/domain/format';
import { colors, gradients, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import type { Chapter, Report, ReportEvidence } from '@/types';

function clockLabel(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function ReportScreen({ chapter, report, onBack, onResolveAudio, onResolveNightAudio, onShare, onRetry, onContinue }: {
  chapter: Chapter;
  report?: Report;
  onBack: () => void;
  onResolveAudio: () => Promise<string | undefined>;
  onResolveNightAudio?: (nightId: string) => Promise<string | undefined>;
  onShare: () => void;
  onRetry?: () => Promise<void>;
  onContinue?: () => void;
}) {
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const evidencePlayer = useAudioPlayer();
  const evidenceStatus = useAudioPlayerStatus(evidencePlayer);

  const [playerError, setPlayerError] = useState('');
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState<string | null>(null);
  /** Kept per quote so the message lands in the card whose wax was pressed. A
   *  single page-level error sat two screens above the control that caused it,
   *  which read as the wax simply not working. */
  const [evidenceError, setEvidenceError] = useState<{ segmentId: string; message: string } | null>(null);
  const loadedSource = useRef<string | null>(null);
  const evidenceSource = useRef<string | null>(null);
  const evidenceStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [waveWidth, setWaveWidth] = useState(1);

  const recorded = chapter.nights.filter(isRecorded);
  const minutes = Math.max(1, Math.round(totalVoiceSeconds(recorded) / 60));
  const checkpoint = report?.checkpointNight ?? (recorded.length >= 30 ? 30 : 7);
  const progress = status.duration ? status.currentTime / status.duration : 0;

  /** Resolves once and then resumes — it used to `replace()` on every press,
   *  which silently restarted the report from zero after any pause. */
  const togglePlay = useCallback(async () => {
    try {
      setPlayerError('');
      if (status.playing) {
        player.pause();
        return;
      }
      if (!loadedSource.current) {
        setLoadingAudio(true);
        const source = await onResolveAudio();
        if (!source) throw new Error('Report audio is not ready yet.');
        player.replace(source);
        loadedSource.current = source;
      }
      player.play();
    } catch (error) {
      setPlayerError(error instanceof Error ? error.message : 'Report audio could not be played.');
    } finally {
      setLoadingAudio(false);
    }
  }, [onResolveAudio, player, status.playing]);

  const restart = useCallback(() => {
    player.seekTo(0);
    if (!status.playing) player.play();
  }, [player, status.playing]);

  const scrub = useCallback((event: GestureResponderEvent) => {
    if (!loadedSource.current || !status.duration) return;
    const fraction = Math.min(1, Math.max(0, event.nativeEvent.locationX / waveWidth));
    player.seekTo(fraction * status.duration);
  }, [player, status.duration, waveWidth]);

  /** Plays the exact moment a quote came from, then stops at its end. */
  const playEvidence = useCallback(async (evidence: ReportEvidence) => {
    if (!onResolveNightAudio) return;
    try {
      setEvidenceError(null);
      if (evidenceStop.current) clearTimeout(evidenceStop.current);
      if (activeEvidence === evidence.segmentId && evidenceStatus.playing) {
        evidencePlayer.pause();
        setActiveEvidence(null);
        return;
      }
      if (status.playing) player.pause();
      setActiveEvidence(evidence.segmentId);
      const source = await onResolveNightAudio(evidence.nightId);
      if (!source) throw new Error('That night is not available on this device.');
      if (evidenceSource.current !== source) {
        evidencePlayer.replace(source);
        evidenceSource.current = source;
      }
      evidencePlayer.seekTo(evidence.startMs / 1000);
      evidencePlayer.play();
      evidenceStop.current = setTimeout(() => {
        evidencePlayer.pause();
        setActiveEvidence(null);
      }, Math.max(400, evidence.endMs - evidence.startMs));
    } catch (error) {
      setActiveEvidence(null);
      setEvidenceError({
        segmentId: evidence.segmentId,
        message: error instanceof Error ? error.message : 'That moment could not be played.',
      });
    }
  }, [activeEvidence, evidencePlayer, evidenceStatus.playing, onResolveNightAudio, player, status.playing]);

  const revealedNights = chapter.nights.map((night) =>
    night.status === 'sealed' && night.index <= checkpoint ? { ...night, status: 'revealed' as const } : night);

  return (
    <Screen paper header={<AppHeader label="OPENED CHAPTER" onBack={onBack} onShare={report?.status === 'ready' ? onShare : undefined} paper />}>
      <Stagger index={0}>
        <View style={styles.gridCard}>
          <LinearGradient colors={gradients.cardSheen} style={styles.cardSheen} pointerEvents="none" />
          <Sparkle size={13} color={colors.brass} twinkle style={styles.cardSparkle} />
          <WindowGrid
            nights={revealedNights.slice(Math.max(0, checkpoint - 30), checkpoint)}
            maxWidth={300}
            padToSheet={checkpoint > 7}
          />
        </View>
      </Stagger>

      <Stagger index={1}>
        <Text accessibilityRole="header" style={styles.title}>
          {checkpoint === 7 ? 'Seven nights' : `${checkpoint} nights`}
        </Text>
        <Text style={styles.month}>{chapterTitle(chapter)}</Text>
        <Text style={styles.metrics}>{recorded.length} recorded nights · {minutes} minutes of voice</Text>
      </Stagger>

      {report?.status === 'ready' ? (
        <>
          {report.audioPath || report.audioUrl ? (
            <Stagger index={2}>
              <View style={styles.playerCard}>
                <View style={styles.playerRow}>
                  <Button
                    variant="paper"
                    icon={loadingAudio ? undefined : status.playing ? Pause : Play}
                    loading={loadingAudio}
                    onPress={() => void togglePlay()}
                    style={styles.playButton}
                  >
                    {status.playing ? 'Pause' : loadedSource.current ? 'Resume' : 'Listen'}
                  </Button>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Restart from the beginning"
                    onPress={restart}
                    disabled={!loadedSource.current}
                    style={({ pressed }) => [styles.restart, !loadedSource.current && styles.restartDisabled, pressed && styles.pressed]}
                  >
                    <RotateCcw size={17} strokeWidth={2} color={colors.paperDim} />
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="adjustable"
                  accessibilityLabel="Report audio position"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
                  onPress={scrub}
                  onLayout={(event) => setWaveWidth(Math.max(1, event.nativeEvent.layout.width))}
                  style={styles.wave}
                >
                  <Waveform paper progress={progress} />
                </Pressable>
                <View style={styles.timeRow}>
                  <Text style={styles.time}>{clockLabel(status.currentTime || 0)}</Text>
                  <Text style={styles.time}>{clockLabel(status.duration || 0)}</Text>
                </View>
              </View>
            </Stagger>
          ) : null}

          {playerError ? <Text accessibilityRole="alert" style={styles.error}>{playerError}</Text> : null}

          {report.sections.map((section, index) => (
            <Stagger key={`${section.title}-${index}`} index={3 + index}>
              <View style={styles.section}>
                <Text style={styles.eyebrow}>{section.eyebrow || `Thread ${index + 1}`}</Text>
                <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.body}>{section.body}</Text>
                {section.guidance ? (
                  <View style={styles.guidance}>
                    <Text style={styles.guidanceLabel}>Try this next</Text>
                    <Text style={styles.guidanceText}>{section.guidance}</Text>
                  </View>
                ) : null}
                {section.evidence.map((evidence) => {
                  const playingThis = activeEvidence === evidence.segmentId;
                  return (
                    // A quote is a scrap of the night it came from, held down by a
                    // wax dot. Pressing the wax plays the exact seconds that were
                    // spoken — the seal is the affordance, not a button beside it.
                    <View key={evidence.segmentId} style={styles.quoteCard}>
                      {onResolveNightAudio ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Play this moment from night ${evidence.nightIndex}`}
                          onPress={() => void playEvidence(evidence)}
                          hitSlop={10}
                          style={({ pressed }) => [styles.waxDot, playingThis && styles.waxDotActive, pressed && styles.waxDotPressed]}
                        >
                          {playingThis && !evidenceStatus.playing ? (
                            <ActivityIndicator size="small" color={colors.white} />
                          ) : playingThis ? (
                            <Pause size={15} strokeWidth={2.6} color={colors.white} fill={colors.white} />
                          ) : (
                            <Play size={15} strokeWidth={2.6} color={colors.white} fill={colors.white} />
                          )}
                        </Pressable>
                      ) : (
                        <View style={styles.waxDot}>
                          <Quote size={15} strokeWidth={2.4} color={colors.white} />
                        </View>
                      )}
                      {evidence.quote ? <Text style={styles.quote}>{evidence.quote}</Text> : null}
                      <Text style={styles.night}>
                        Night {evidence.nightIndex} · {formatDuration(Math.floor(evidence.startMs / 1000))}
                        {onResolveNightAudio ? (playingThis ? ' · playing' : ' · press the wax to hear it') : ''}
                      </Text>
                      {evidenceError?.segmentId === evidence.segmentId ? (
                        <Text accessibilityRole="alert" style={styles.evidenceError}>{evidenceError.message}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </Stagger>
          ))}

          <Stagger index={3 + report.sections.length}>
            <View style={styles.summary}>
              <LinearGradient colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']} style={styles.cardSheen} pointerEvents="none" />
              <Text style={styles.eyebrow}>The arc</Text>
              <Text style={styles.summaryTitle}>{report.summary || 'No single pattern needed to be invented.'}</Text>
            </View>
            <View style={styles.actions}>
              <Button variant="paper" icon={Share2} onPress={onShare}>Share reflection</Button>
              {onContinue ? <Button variant="outline" onPress={onContinue}>Continue the thread</Button> : null}
            </View>
          </Stagger>
        </>
      ) : report?.status === 'failed' ? (
        <Stagger index={2}>
          <View style={styles.unavailableCard}>
            <Text style={styles.eyebrow}>This report needs attention</Text>
            <Text style={styles.summaryTitle}>Your recordings remain sealed and safe.</Text>
            <Text style={styles.body}>
              The report stopped rather than substituting sample conclusions. Reference: {report.traceId || 'available to support'}.
            </Text>
            {onRetry ? (
              <Button
                variant="paper"
                onPress={() => void onRetry().catch((error: unknown) => setPlayerError(
                  error instanceof Error ? error.message : 'The report could not be retried.',
                ))}
              >
                Retry report
              </Button>
            ) : null}
          </View>
        </Stagger>
      ) : (
        <Stagger index={2}>
          <View style={styles.unavailableCard}>
            <Text style={styles.eyebrow}>{report?.status === 'running' ? 'Creating your report' : 'Report queued'}</Text>
            <Text style={styles.summaryTitle}>Your chapter is sealed.</Text>
            <Text style={styles.body}>
              {report
                ? 'The app will synchronize the real report when cloud processing finishes. No sample conclusions are shown.'
                : 'A report can be queued once the required recordings are backed up and cloud-processing consent is confirmed.'}
            </Text>
            {onContinue && checkpoint === 7 ? <Button variant="paper" onPress={onContinue}>Continue the thread</Button> : null}
          </View>
        </Stagger>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  cardSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 70 },
  cardSparkle: { position: 'absolute', top: 14, right: 18 },

  gridCard: {
    marginBottom: 30,
    paddingVertical: 24,
    alignItems: 'center',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: surfaces.card,
    overflow: 'hidden',
    ...shadows.floating,
    shadowOpacity: 0.12,
  },
  title: {
    color: colors.paperInk,
    fontFamily: typography.serifSemiBold,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1.2,
  },
  month: {
    color: colors.paperInk,
    fontFamily: typography.serifItalic,
    fontSize: 24,
    marginTop: 4,
    marginBottom: 14,
  },
  metrics: {
    ...textStyles.caption,
    color: colors.paperDim,
    fontFamily: typography.mono,
    fontSize: 12,
    marginBottom: 22,
  },

  playerCard: {
    padding: 18,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: surfaces.card,
    ...shadows.soft,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playButton: { flex: 1 },
  restart: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: surfaces.card,
  },
  restartDisabled: { opacity: 0.4 },
  wave: { marginTop: 16, paddingVertical: 6 },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  time: {
    color: colors.paperDim,
    fontFamily: typography.mono,
    fontSize: 12,
  },

  section: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,35,49,0.14)',
    paddingTop: 28,
    marginTop: 16,
  },
  // A written aside in the margin of the letter, not another shouted kicker.
  eyebrow: {
    color: colors.paperDim,
    fontFamily: typography.serifItalic,
    fontSize: 17,
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.paperInk,
    fontFamily: typography.serifSemiBold,
    fontSize: 30,
    lineHeight: 37,
    letterSpacing: -0.6,
    marginBottom: 12,
  },
  body: {
    color: colors.paperInk,
    fontFamily: typography.sans,
    fontWeight: weight.regular,
    fontSize: 17,
    lineHeight: 28,
  },
  guidance: {
    marginTop: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderLeftWidth: 3,
    borderLeftColor: colors.brass,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(220, 177, 132, 0.13)',
  },
  guidanceLabel: {
    color: colors.brassText,
    fontFamily: typography.mono,
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  guidanceText: {
    color: colors.paperInk,
    fontFamily: typography.sans,
    fontWeight: weight.medium,
    fontSize: 16,
    lineHeight: 25,
  },
  // A torn scrap of paper, tilted slightly, with room at the top for the wax
  // dot that overlaps its edge.
  quoteCard: {
    marginTop: 30,
    paddingTop: 30,
    paddingBottom: 18,
    paddingHorizontal: 20,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: surfaces.card,
    transform: [{ rotate: '-0.5deg' }],
    ...shadows.soft,
    shadowOpacity: 0.09,
  },
  waxDot: {
    position: 'absolute',
    top: -18,
    left: 22,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.roseDeep,
    borderWidth: 2,
    borderColor: colors.white,
    shadowColor: '#7A3244',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.34,
    shadowRadius: 8,
    elevation: 6,
  },
  waxDotActive: {
    backgroundColor: colors.brassText,
  },
  waxDotPressed: {
    transform: [{ scale: 0.92 }],
  },
  quote: {
    ...textStyles.quote,
    marginBottom: 12,
  },
  night: {
    color: colors.paperDim,
    fontFamily: typography.mono,
    fontSize: 11,
  },
  evidenceError: {
    ...textStyles.bodySmall,
    color: colors.ember,
    fontSize: 13,
    marginTop: 8,
  },

  summary: {
    marginTop: 32,
    padding: 24,
    borderRadius: radii.lg,
    backgroundColor: '#F5E2E5',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
  },
  summaryTitle: {
    color: colors.paperInk,
    fontFamily: typography.serifSemiBold,
    fontSize: 27,
    lineHeight: 34,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  actions: { gap: 10, marginTop: 24 },
  unavailableCard: {
    marginTop: 8,
    padding: 22,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    backgroundColor: surfaces.cardSoft,
    gap: 12,
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.ember,
    fontSize: 14,
    marginTop: 10,
  },
});
