import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Mic, Square } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Buttons';
import { Screen, Stagger } from '@/components/Screen';
import { Glow, Sparkle } from '@/components/Sparkle';
import { Waveform } from '@/components/Waveform';
import { colors, motion, radii, shadows, textStyles, typography, weight } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { completedStickerAssets, stickerAssetForNight } from '@/data/keepsakeAssets';

const MIN_SECONDS = 10;
const SUGGESTED_SECONDS = 90;
const MAX_SECONDS = 300;
const BUTTON = 152;
const RING = BUTTON + 22;
const LEVEL_HISTORY = 52;
/** Below this, a press counts as a tap and latches recording on. */
const TAP_MS = 400;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** expo-audio reports metering in dBFS (≈ -160 silent … 0 clipping). */
function meteringToLevel(db?: number) {
  if (db === undefined || Number.isNaN(db)) return 0.18;
  const normalized = (db + 55) / 55;
  return Math.min(1, Math.max(0.12, normalized));
}

export function QuestionScreen({ nightIndex, question, onBack, onSeal }: {
  nightIndex: number;
  question: string;
  onBack: () => void;
  onSeal: (durationSec: number, uri?: string) => Promise<void>;
}) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    directory: 'cache',
    numberOfChannels: 1,
    bitRate: 64_000,
    isMeteringEnabled: true,
    web: { ...RecordingPresets.HIGH_QUALITY.web, bitsPerSecond: 64_000 },
  });
  const recorderState = useAudioRecorderState(recorder, 100);

  const [phase, setPhase] = useState<'question' | 'ready'>('question');
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [sheet, setSheet] = useState<'primer' | 'denied' | 'short' | 'leave' | 'error' | null>(null);
  const [error, setError] = useState('');
  const [finalDuration, setFinalDuration] = useState(0);
  const [finalUri, setFinalUri] = useState<string | undefined>();
  const [sealing, setSealing] = useState(false);
  const [latched, setLatched] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);

  const startTime = useRef(0);
  const pressStart = useRef(0);
  const finishing = useRef(false);
  const aura = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const finishRef = useRef<(hitCap?: boolean) => Promise<void>>(async () => undefined);

  const recording = recorderState.isRecording;

  // A smooth, monotonic clock. Rounding a 100ms poll made the timer visibly
  // stutter and occasionally repeat or skip a second.
  useEffect(() => {
    if (!recording) return;
    const tick = setInterval(() => {
      setElapsed(Math.max(0, (Date.now() - startTime.current) / 1000));
    }, 100);
    return () => clearInterval(tick);
  }, [recording]);

  // Rolling meter history — this is what the waveform draws.
  useEffect(() => {
    if (!recording) return;
    setLevels((current) => {
      const next = [...current, meteringToLevel(recorderState.metering)];
      return next.length > LEVEL_HISTORY ? next.slice(next.length - LEVEL_HISTORY) : next;
    });
  }, [recording, recorderState.metering, recorderState.durationMillis]);

  // Breathing aura behind the button (§11.2 "Recording state").
  useEffect(() => {
    if (!recording || reducedMotion) {
      aura.stopAnimation();
      aura.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(aura, { toValue: 1, duration: 1700, easing: motion.easeInOut, useNativeDriver: true }),
      Animated.timing(aura, { toValue: 0, duration: 1700, easing: motion.easeInOut, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [aura, recording, reducedMotion]);

  const seal = useCallback(async (duration: number, uri?: string) => {
    setSheet(null);
    setSealing(true);
    try {
      await onSeal(duration, uri);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The recording could not be sealed. Tonight remains open.');
      setSealing(false);
      setSheet('error');
    }
  }, [onSeal]);

  const finishRecording = useCallback(async (hitCap = false) => {
    if (!recorderState.isRecording || finishing.current) return;
    finishing.current = true;
    setLatched(false);
    const wallClock = Math.max(1, Math.round((Date.now() - startTime.current) / 1000));
    try {
      await recorder.stop();
      const duration = hitCap ? MAX_SECONDS : Math.max(wallClock, Math.round(recorderState.durationMillis / 1000));
      const uri = recorder.uri ?? recorderState.url ?? undefined;
      setFinalDuration(duration);
      setFinalUri(uri);
      if (duration < MIN_SECONDS) {
        finishing.current = false;
        setSheet('short');
      } else {
        await seal(duration, uri);
      }
    } catch (caught) {
      finishing.current = false;
      setError(caught instanceof Error ? caught.message : 'The recorder could not close safely. Tonight remains open.');
      setSheet('error');
    }
  }, [recorder, recorderState.durationMillis, recorderState.isRecording, recorderState.url, seal]);

  finishRef.current = finishRecording;

  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= MAX_SECONDS * 1000) {
      void finishRef.current(true);
    }
  }, [recorderState.durationMillis, recorderState.isRecording]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && recorderState.isRecording) void finishRef.current();
      if (state === 'active') {
        void AudioModule.getRecordingPermissionsAsync().then((permission) => setPermissionGranted(permission.granted));
      }
    });
    return () => subscription.remove();
  }, [recorderState.isRecording]);

  const requestMic = async () => {
    setSheet(null);
    const result = await AudioModule.requestRecordingPermissionsAsync();
    if (!result.granted) {
      setSheet('denied');
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    setPermissionGranted(true);
    setPhase('ready');
  };

  const startRecording = async () => {
    if (!permissionGranted || recorderState.isRecording || sealing) return;
    try {
      finishing.current = false;
      setFinalDuration(0);
      setFinalUri(undefined);
      setLevels([]);
      setElapsed(0);
      await recorder.prepareToRecordAsync();
      recorder.record();
      startTime.current = Date.now();
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The recorder could not start. Check available storage and audio devices.');
      setSheet('error');
    }
  };

  const discard = async () => {
    setSheet(null);
    finishing.current = false;
    setFinalDuration(0);
    setFinalUri(undefined);
    setLevels([]);
    setElapsed(0);
  };

  // Tap to start and tap again to stop, or press and hold. A five-minute cap
  // that can only be reached by physically holding a button is not usable.
  const handlePressIn = () => {
    pressStart.current = Date.now();
    if (recording && latched) return;
    if (!recording) void startRecording();
  };

  const handlePressOut = () => {
    const held = Date.now() - pressStart.current;
    if (recording && latched) {
      void finishRecording();
      return;
    }
    if (!recording) return;
    if (held < TAP_MS) {
      setLatched(true);
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    void finishRecording();
  };

  const handleBack = () => {
    if (recorderState.isRecording) setSheet('leave');
    else onBack();
  };

  if (phase === 'question') {
    return (
      <Screen scroll={false} contentStyle={styles.screen}>
        <Stagger index={0}>
          <AppHeader label={`NIGHT ${nightIndex}`} onBack={onBack} />
        </Stagger>
        <Stagger index={1} style={styles.questionWrap}>
          <View style={styles.nightSticker}>
            <Glow size={150} color={colors.rose} opacity={0.45} style={styles.stickerGlow} />
            <Image source={stickerAssetForNight(completedStickerAssets, nightIndex)} resizeMode="contain" style={styles.nightStickerArt} />
          </View>
          <View style={styles.questionPaper}>
            <Sparkle size={15} color={colors.brass} twinkle style={styles.paperSparkle} />
            <Text style={textStyles.eyebrow}>TONIGHT&apos;S QUESTION</Text>
            <Text accessibilityRole="header" style={styles.question}>{question}</Text>
          </View>
        </Stagger>
        <Stagger index={2} style={styles.questionFooter}>
          <Text style={styles.note}>You get one take. There is no playback until it is revealed.</Text>
          <Button onPress={() => setSheet('primer')}>I&apos;m ready</Button>
        </Stagger>
        <BottomSheet
          visible={sheet === 'primer'}
          title="We need the microphone."
          body="Only while you are recording, and only on this device until you choose otherwise."
          actions={[
            { label: 'Allow', onPress: () => void requestMic() },
            { label: 'Not now', variant: 'outline', onPress: () => setSheet(null) },
          ]}
          onClose={() => setSheet(null)}
        />
      </Screen>
    );
  }

  const seconds = recording ? elapsed : finalDuration;
  const capProgress = Math.min(1, seconds / MAX_SECONDS);
  const suggestedReached = seconds >= SUGGESTED_SECONDS;
  const nearCap = seconds >= MAX_SECONDS - 30;
  const circumference = 2 * Math.PI * (RING / 2 - 3);

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <AppHeader label={`NIGHT ${nightIndex}`} onBack={handleBack} />

      <View style={styles.recordTop}>
        <Text numberOfLines={3} style={styles.smallQuestion}>{question}</Text>
        <Text
          accessibilityLabel={`${Math.floor(seconds / 60)} minutes ${Math.floor(seconds % 60)} seconds recorded`}
          style={[styles.timer, nearCap && styles.timerWarning]}
        >
          {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(Math.floor(seconds % 60)).padStart(2, '0')}
        </Text>
        <Waveform levels={recording ? levels : undefined} active={recording} compact />
        <Text style={[styles.limitHint, suggestedReached && styles.limitHintMet]}>
          {nearCap
            ? `Wrapping up at five minutes — ${Math.max(0, MAX_SECONDS - Math.floor(seconds))}s left.`
            : suggestedReached
              ? 'You have said plenty. Release whenever you are ready.'
              : 'Ninety seconds is plenty. Five minutes is the ceiling.'}
        </Text>
      </View>

      <View style={styles.recordArea}>
        {recording && !reducedMotion ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.auraLayer,
              {
                opacity: aura.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }),
                transform: [{ scale: aura.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.22] }) }],
              },
            ]}
          >
            <Glow size={RING * 2} color={colors.rose} opacity={0.5} style={{ left: -RING / 2, top: -RING / 2 }} />
          </Animated.View>
        ) : null}

        {/* Progress toward the hard cap, so the ceiling is visible rather than a surprise. */}
        <View pointerEvents="none" style={styles.ring}>
          <Svg width={RING} height={RING}>
            <Circle
              cx={RING / 2} cy={RING / 2} r={RING / 2 - 3}
              stroke="rgba(190,111,124,0.16)" strokeWidth={3} fill="none"
            />
            <AnimatedCircle
              cx={RING / 2} cy={RING / 2} r={RING / 2 - 3}
              stroke={nearCap ? colors.ember : colors.brass}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - capProgress)}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Stop and seal this take' : 'Start recording. Tap to record hands-free, or press and hold.'}
          accessibilityState={{ busy: recording }}
          disabled={sealing}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={({ pressed }) => [styles.recordButton, recording && styles.recording, pressed && styles.recordPressed]}
        >
          <View style={[styles.recordCore, recording && styles.recordCoreActive]}>
            {recording && latched
              ? <Square size={26} color={colors.white} strokeWidth={2.4} fill={colors.white} />
              : <Mic size={34} color={colors.white} strokeWidth={2} />}
          </View>
        </Pressable>

        <Text style={styles.hold}>
          {recording
            ? latched ? 'TAP TO SEAL' : 'RELEASE TO SEAL'
            : Platform.OS === 'web' ? 'CLICK TO START · HOLD TO TALK' : 'TAP TO START · HOLD TO TALK'}
        </Text>
        {!recording ? <Text style={styles.holdHelp}>A quick tap keeps recording so you can put the phone down.</Text> : null}
      </View>

      {/* A real, visible sealing state. This used to be a silent frozen screen. */}
      {sealing ? (
        <View style={styles.sealingOverlay} accessibilityLiveRegion="polite">
          <View style={styles.sealingCard}>
            <ActivityIndicator color={colors.roseText} />
            <Text style={styles.sealingText}>Sealing your take…</Text>
            <Text style={styles.sealingHint}>Writing it to this device before anything else happens.</Text>
          </View>
        </View>
      ) : null}

      <BottomSheet
        visible={sheet === 'short'}
        title={`That was ${finalDuration} ${finalDuration === 1 ? 'second' : 'seconds'}.`}
        body="Short is allowed — but you have not used your take yet, so you can start over if you would rather."
        actions={[
          { label: 'Start this night over', variant: 'outline', onPress: () => void discard() },
          { label: 'Seal it anyway', onPress: () => void seal(finalDuration, finalUri) },
        ]}
        onClose={() => void discard()}
      />
      <BottomSheet
        visible={sheet === 'denied'}
        title="Without the microphone there is no app."
        body="Turn it on in Settings and come straight back."
        actions={[
          { label: 'Open system settings', onPress: () => void Linking.openSettings() },
          { label: 'Check again', variant: 'outline', onPress: () => void requestMic() },
          { label: 'Close', variant: 'ghost', onPress: () => setSheet(null) },
        ]}
        onClose={() => setSheet(null)}
      />
      <BottomSheet
        visible={sheet === 'error'}
        title="Tonight remains open."
        body={error}
        actions={[
          ...(finalUri
            ? [{ label: 'Retry sealing this take', onPress: () => void seal(finalDuration, finalUri) }]
            : [{ label: 'Back to tonight’s question', onPress: () => { finishing.current = false; setSheet(null); setPhase('question'); } }]),
          { label: 'Return home', variant: 'outline' as const, onPress: onBack },
        ]}
        onClose={() => undefined}
        blocking
      />
      <BottomSheet
        visible={sheet === 'leave'}
        title="Leave without sealing?"
        body="Nothing gets saved and tonight stays empty."
        actions={[
          { label: 'Keep recording', onPress: () => setSheet(null) },
          { label: 'Leave', variant: 'ember', onPress: async () => { await recorder.stop(); onBack(); } },
        ]}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'space-between',
    gap: 16,
  },
  questionWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 22,
    paddingBottom: 24,
  },
  nightSticker: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerGlow: { left: -29, top: -29 },
  nightStickerArt: { width: '112%', height: '112%' },
  questionPaper: {
    width: '100%',
    justifyContent: 'center',
    gap: 18,
    paddingHorizontal: 26,
    paddingVertical: 34,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    backgroundColor: 'rgba(255,253,249,0.9)',
    ...shadows.floating,
  },
  paperSparkle: { position: 'absolute', right: 22, top: 20 },
  question: {
    ...textStyles.display,
    fontSize: 37,
    lineHeight: 45,
  },
  questionFooter: {
    gap: 16,
  },
  note: {
    ...textStyles.bodySmall,
    fontSize: 14,
    textAlign: 'center',
  },

  recordTop: {
    alignItems: 'center',
    gap: 14,
    padding: 20,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,253,249,0.76)',
    ...shadows.soft,
    shadowOpacity: 0.07,
  },
  smallQuestion: {
    ...textStyles.body,
    fontFamily: typography.serifMedium,
    textAlign: 'center',
    fontSize: 19,
    lineHeight: 27,
  },
  timer: {
    color: colors.bone,
    fontFamily: typography.monoMedium,
    fontSize: 44,
    letterSpacing: 2,
  },
  timerWarning: {
    color: colors.ember,
  },
  limitHint: {
    ...textStyles.caption,
    textAlign: 'center',
  },
  limitHintMet: {
    color: colors.mossText,
  },

  recordArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auraLayer: {
    position: 'absolute',
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButton: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: colors.white,
    backgroundColor: '#F7DADD',
    shadowColor: '#8A3547',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 10,
  },
  recording: {
    backgroundColor: '#EFAFB6',
    borderColor: '#FFF4F5',
  },
  recordPressed: {
    transform: [{ scale: 0.95 }],
  },
  recordCore: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.roseDeep,
  },
  recordCoreActive: {
    borderRadius: 22,
    backgroundColor: colors.ember,
  },
  hold: {
    ...textStyles.eyebrow,
    marginTop: 26,
    letterSpacing: 2,
  },
  holdHelp: {
    ...textStyles.caption,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 260,
  },

  sealingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,239,231,0.86)',
  },
  sealingCard: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 28,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    ...shadows.lifted,
  },
  sealingText: {
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 19,
  },
  sealingHint: {
    ...textStyles.caption,
    textAlign: 'center',
    maxWidth: 220,
  },
});
