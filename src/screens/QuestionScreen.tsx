import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { formatLongDate } from '@/domain/format';
import { colors, motion, nativeAnimationDriver, night, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { keepsakeDecorations, mysteryEmboss } from '@/data/keepsakeAssets';

const MIN_SECONDS = 10;
const SUGGESTED_SECONDS = 90;
const MAX_SECONDS = 300;
const BUTTON = 152;
const RING = BUTTON + 22;
const LEVEL_HISTORY = 52;
/** Below this, a press counts as a tap and latches recording on. */
const TAP_MS = 400;

/** An overlay wider than the button cannot be centred with flexbox: Yoga clamps
 *  main-axis overflow, so a taller-than-parent child is pinned to the top of the
 *  stage instead of overhanging both ends — which drew the cap ring a full 11px
 *  below the button. Placing these boxes by offset keeps them truly concentric. */
function concentric(size: number) {
  return {
    position: 'absolute' as const,
    top: (BUTTON - size) / 2,
    left: (BUTTON - size) / 2,
    width: size,
    height: size,
  };
}
const RING_LAYER = concentric(RING);
const GLOW_REST_LAYER = concentric(RING * 1.7);
const GLOW_AURA_LAYER = concentric(RING * 2);
const GLOW_VOICE_LAYER = concentric(RING * 2.2);

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

  const [phase, setPhase] = useState<'letter' | 'question' | 'ready'>('letter');
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
  const pressBeganWhileRecording = useRef(false);
  const starting = useRef<Promise<boolean> | null>(null);
  const recordingRef = useRef(false);
  const finishing = useRef(false);
  const aura = useRef(new Animated.Value(0)).current;
  /** Follows the live meter, so the halo answers the voice, not a timer. */
  const voice = useRef(new Animated.Value(0)).current;
  const crack = useRef(new Animated.Value(0)).current;
  const cracking = useRef(false);
  const reducedMotion = useReducedMotion();
  const finishRef = useRef<(hitCap?: boolean) => Promise<void>>(async () => undefined);

  const recording = recorderState.isRecording;
  recordingRef.current = recording;

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

  // The halo answers the voice. Each meter sample nudges a spring, so speaking
  // visibly blooms the light around the button and silence lets it settle.
  useEffect(() => {
    if (!recording) {
      voice.setValue(0);
      return;
    }
    Animated.spring(voice, {
      toValue: meteringToLevel(recorderState.metering),
      damping: 20,
      stiffness: 260,
      mass: 0.6,
      useNativeDriver: nativeAnimationDriver,
    }).start();
  }, [recording, recorderState.metering, voice]);

  // Breathing aura behind the button (§11.2 "Recording state").
  useEffect(() => {
    if (!recording || reducedMotion) {
      aura.stopAnimation();
      aura.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(aura, { toValue: 1, duration: 1700, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
      Animated.timing(aura, { toValue: 0, duration: 1700, easing: motion.easeInOut, useNativeDriver: nativeAnimationDriver }),
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
    if (!recordingRef.current || finishing.current) return;
    finishing.current = true;
    setLatched(false);
    const wallClock = Math.max(1, Math.round((Date.now() - startTime.current) / 1000));
    try {
      await recorder.stop();
      recordingRef.current = false;
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
  }, [recorder, recorderState.durationMillis, recorderState.url, seal]);

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
        void AudioModule.getRecordingPermissionsAsync()
          .then((permission) => setPermissionGranted(permission.granted))
          .catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [recorderState.isRecording]);

  const requestMic = async () => {
    setSheet(null);
    try {
      const result = await AudioModule.requestRecordingPermissionsAsync();
      if (!result.granted) {
        setSheet('denied');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      setPermissionGranted(true);
      setPhase('ready');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Microphone access could not be prepared.');
      setSheet('error');
    }
  };

  const startRecording = async (): Promise<boolean> => {
    if (!permissionGranted || recordingRef.current || sealing) return false;
    try {
      finishing.current = false;
      setFinalDuration(0);
      setFinalUri(undefined);
      setLevels([]);
      setElapsed(0);
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      startTime.current = Date.now();
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
      return true;
    } catch (caught) {
      recordingRef.current = false;
      setError(caught instanceof Error ? caught.message : 'The recorder could not start. Check available storage and audio devices.');
      setSheet('error');
      return false;
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
    pressBeganWhileRecording.current = recordingRef.current;
    if (recordingRef.current) return;
    const pending = startRecording();
    starting.current = pending;
  };

  const handlePressOut = () => {
    const held = Date.now() - pressStart.current;
    if (pressBeganWhileRecording.current) {
      void finishRecording();
      return;
    }
    const pending = starting.current;
    if (!pending) return;
    void pending.then(async (started) => {
      if (starting.current === pending) starting.current = null;
      if (!started) return;
      if (held < TAP_MS) {
        setLatched(true);
        if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        return;
      }
      await finishRef.current();
    }).catch(() => undefined);
  };

  const handleBack = () => {
    if (recorderState.isRecording) setSheet('leave');
    else onBack();
  };

  /** Break the seal: a press, a wobble, a flash, and the letter is open. */
  const breakSeal = () => {
    if (cracking.current) return;
    cracking.current = true;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    if (reducedMotion) {
      setPhase('question');
      return;
    }
    Animated.timing(crack, {
      toValue: 1,
      duration: 680,
      easing: motion.easeGentle,
      useNativeDriver: nativeAnimationDriver,
    }).start(({ finished }) => {
      if (finished) setPhase('question');
      cracking.current = false;
    });
  };

  if (phase === 'letter') {
    return (
      <Screen scroll={false} variant="night" contentStyle={styles.screen}>
        <Stagger index={0}>
          <AppHeader night label={`NIGHT ${nightIndex}`} onBack={onBack} />
        </Stagger>
        <Stagger index={1} style={styles.letterStage}>
          <Animated.View
            style={{
              opacity: crack.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 1, 0] }),
              transform: [
                { scale: crack.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 1.04, 1.12] }) },
              ],
            }}
          >
            <View style={styles.letterEnvelope}>
              <LinearGradient colors={['#FFFCF7', '#F6E7DF']} style={StyleSheet.absoluteFill} />
              <View style={styles.letterFlap}>
                <LinearGradient colors={['#F9EDE6', '#EFD9D1']} style={StyleSheet.absoluteFill} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Break the seal and read tonight's question"
                onPress={breakSeal}
                hitSlop={18}
                style={({ pressed }) => [styles.letterSealWrap, pressed && styles.letterSealPressed]}
              >
                <Glow size={150} color={night.candle} opacity={0.5} style={styles.letterSealGlow} />
                <Animated.View
                  style={{
                    transform: [
                      { rotate: crack.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['0deg', '-7deg', '6deg', '-3deg', '0deg'] }) },
                      { scale: crack.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.1, 1.3] }) },
                    ],
                  }}
                >
                  <Image source={keepsakeDecorations.waxSeal} resizeMode="contain" style={styles.letterSealArt} />
                </Animated.View>
              </Pressable>
              {/* The flash as the wax gives way. */}
              <Animated.View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  styles.letterFlash,
                  { opacity: crack.interpolate({ inputRange: [0, 0.5, 0.7, 1], outputRange: [0, 0, 0.55, 0] }) },
                ]}
              />
            </View>
          </Animated.View>
          <Sparkle size={13} color={night.candle} twinkle style={styles.letterSparkleOne} />
          <Sparkle size={9} color={night.candle} twinkle delay={1400} style={styles.letterSparkleTwo} />
        </Stagger>
        <Stagger index={2} style={styles.letterFooter}>
          <Text accessibilityRole="header" style={styles.letterTitle}>A question waits for you.</Text>
          <Text style={styles.letterHint}>Press the seal to open tonight&apos;s letter.</Text>
        </Stagger>
      </Screen>
    );
  }

  if (phase === 'question') {
    return (
      <Screen scroll={false} variant="night" contentStyle={styles.screen}>
        <Stagger index={0}>
          <AppHeader night label={`NIGHT ${nightIndex}`} onBack={onBack} />
        </Stagger>
        <Stagger index={1} style={styles.questionWrap}>
          {/* Tonight's sticker stays a secret until the take is sealed. The slot
              above the letter holds its blind emboss, not the answer. */}
          <View style={styles.nightSticker}>
            <Glow size={190} color={colors.rose} opacity={0.45} style={styles.stickerGlow} />
            <Image source={mysteryEmboss} resizeMode="contain" style={styles.nightStickerArt} />
            <Sparkle size={12} color={night.candle} twinkle style={styles.mysterySparkle} />
          </View>
          <View style={styles.questionPaper}>
            <Sparkle size={15} color={colors.brass} twinkle style={styles.paperSparkle} />
            <Text style={[textStyles.eyebrow, styles.paperEyebrow]}>TONIGHT&apos;S QUESTION</Text>
            <Text accessibilityRole="header" style={styles.question}>{question}</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateLine} />
              <Text style={styles.dateLabel}>{formatLongDate(new Date())}</Text>
              <View style={styles.dateLine} />
            </View>
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
    <Screen scroll={false} variant="night" contentStyle={styles.screen}>
      <AppHeader night label={`NIGHT ${nightIndex}`} onBack={handleBack} />

      <View style={styles.recordTop}>
        <Text numberOfLines={3} style={styles.smallQuestion}>{question}</Text>
        <Text
          accessibilityLabel={`${Math.floor(seconds / 60)} minutes ${Math.floor(seconds % 60)} seconds recorded`}
          style={[styles.timer, nearCap && styles.timerWarning]}
        >
          {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(Math.floor(seconds % 60)).padStart(2, '0')}
        </Text>
        <Waveform levels={recording ? levels : undefined} active={recording} idle={!recording && finalDuration === 0} compact />
        <Text style={[styles.limitHint, suggestedReached && styles.limitHintMet]}>
          {nearCap
            ? `Wrapping up at five minutes — ${Math.max(0, MAX_SECONDS - Math.floor(seconds))}s left.`
            : suggestedReached
              ? 'You have said plenty. Release whenever you are ready.'
              : 'Ninety seconds is plenty. Five minutes is the ceiling.'}
        </Text>
      </View>

      <View style={styles.recordArea}>
        {/* Everything that must sit concentric with the button lives inside a
            stage exactly the button's size. Centring these on the record area
            instead put them low, because the labels below share that area and
            push the button above its centre. */}
        <View style={styles.buttonStage}>
        {/* A resting warmth behind the idle button, so the recording stage
            never reads as a blank void while it waits. */}
        {!recording ? (
          <View pointerEvents="none" style={GLOW_REST_LAYER}>
            <Glow size={RING * 1.7} color={colors.rose} opacity={0.2} style={styles.glowInline} />
          </View>
        ) : null}
        {recording && !reducedMotion ? (
          <Animated.View
            pointerEvents="none"
            style={[
              GLOW_AURA_LAYER,
              {
                opacity: aura.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }),
                transform: [{ scale: aura.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.22] }) }],
              },
            ]}
          >
            <Glow size={RING * 2} color={colors.rose} opacity={0.5} style={styles.glowInline} />
          </Animated.View>
        ) : null}
        {/* Candlelight that blooms with the voice itself. The breathing aura is
            the room; this layer is the person speaking in it. */}
        {recording && !reducedMotion ? (
          <Animated.View
            pointerEvents="none"
            style={[
              GLOW_VOICE_LAYER,
              {
                opacity: voice.interpolate({ inputRange: [0.12, 1], outputRange: [0.1, 0.85], extrapolate: 'clamp' }),
                transform: [{ scale: voice.interpolate({ inputRange: [0.12, 1], outputRange: [0.9, 1.4], extrapolate: 'clamp' }) }],
              },
            ]}
          >
            <Glow size={RING * 2.2} color={night.candle} opacity={0.4} style={styles.glowInline} />
          </Animated.View>
        ) : null}

        {/* Progress toward the hard cap — drawn only once a take is underway,
            so the resting screen shows just the button. The layer is positioned
            by offset rather than centred by flex, so the ring stays concentric
            with the button on native and web alike. */}
        {recording || seconds > 0 ? (
          <View pointerEvents="none" style={RING_LAYER}>
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
        ) : null}

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
        </View>

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
        body="Short is allowed. But you have not used your take yet, so you can start over if you would rather."
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
          { label: 'Open system settings', onPress: () => void Linking.openSettings().catch(() => undefined) },
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
          { label: 'Leave', variant: 'ember', onPress: async () => { await recorder.stop(); recordingRef.current = false; onBack(); } },
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
    paddingBottom: 12,
  },

  letterStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterEnvelope: {
    width: 264,
    height: 168,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(102,67,80,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    shadowColor: '#0F060C',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 12,
  },
  letterFlap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 168 * 0.62,
    borderBottomLeftRadius: 120,
    borderBottomRightRadius: 120,
    borderBottomWidth: 1,
    borderColor: 'rgba(102,67,80,0.12)',
    overflow: 'hidden',
  },
  letterSealWrap: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterSealPressed: {
    transform: [{ scale: 0.93 }],
  },
  letterSealGlow: {
    left: -29,
    top: -29,
  },
  letterSealArt: {
    width: 84,
    height: 84,
  },
  letterFlash: {
    borderRadius: radii.md,
    backgroundColor: '#FFF4E4',
  },
  letterSparkleOne: {
    position: 'absolute',
    top: '24%',
    right: '18%',
  },
  letterSparkleTwo: {
    position: 'absolute',
    bottom: '26%',
    left: '16%',
  },
  letterFooter: {
    alignItems: 'center',
    gap: 8,
    paddingBottom: 26,
  },
  letterTitle: {
    ...textStyles.heading,
    color: night.text,
    textAlign: 'center',
  },
  letterHint: {
    ...textStyles.bodySmall,
    color: night.textDim,
    textAlign: 'center',
  },
  mysterySparkle: {
    position: 'absolute',
    top: 10,
    right: 8,
  },
  nightSticker: {
    width: 124,
    height: 124,
    alignItems: 'center',
    justifyContent: 'center',
    // Overlap the card below so sticker and paper read as one object.
    marginBottom: -48,
    zIndex: 1,
  },
  stickerGlow: { left: -33, top: -33 },
  nightStickerArt: { width: '108%', height: '108%' },
  questionPaper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingHorizontal: 26,
    paddingTop: 72,
    paddingBottom: 30,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    backgroundColor: surfaces.card,
    ...shadows.floating,
  },
  paperSparkle: { position: 'absolute', right: 22, top: 20 },
  paperEyebrow: {
    textAlign: 'center',
  },
  question: {
    ...textStyles.display,
    fontSize: 36,
    lineHeight: 44,
    textAlign: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
    alignSelf: 'stretch',
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  dateLabel: {
    ...textStyles.caption,
    color: colors.boneFaint,
    fontFamily: typography.serifItalic,
    fontSize: 14,
  },
  questionFooter: {
    gap: 16,
  },
  note: {
    ...textStyles.bodySmall,
    color: night.textDim,
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
    backgroundColor: surfaces.card,
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
  /** Exactly the button's footprint, so every absolute overlay inside it is
   *  concentric with the button. Larger glows overflow it on purpose. */
  buttonStage: {
    width: BUTTON,
    height: BUTTON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowInline: {
    position: 'relative',
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
    color: night.candle,
    marginTop: 26,
    letterSpacing: 2,
  },
  holdHelp: {
    ...textStyles.caption,
    color: night.textFaint,
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
    backgroundColor: 'rgba(31,14,23,0.78)',
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
