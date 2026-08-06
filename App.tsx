import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, BackHandler, Linking, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Fraunces_400Regular, Fraunces_400Regular_Italic, Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';

import { BottomSheet } from '@/components/BottomSheet';
import { TabBar, type TabKey } from '@/components/TabBar';
import { AppProvider, useApp } from '@/context/AppContext';
import { questionFor } from '@/data/questions';
import { formatDuration } from '@/domain/format';
import { isRecorded, totalVoiceSeconds } from '@/domain/stats';
import { retryReport, signedRecordingUrl, signedReportAudioUrl } from '@/lib/supabase';
import { exportEverything } from '@/services/exportData';
import { cancelNightlyQuestions, requestNotificationPermission, scheduleNightlyQuestions, subscribeToNotificationResponses } from '@/services/notifications';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { GalleryScreen, LightMapScreen } from '@/screens/ArchiveScreens';
import { AuthScreen } from '@/screens/AuthScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { IntentionScreen, PlanScreen } from '@/screens/OnboardingSteps';
import { PaywallScreen } from '@/screens/PaywallScreen';
import { PopupCatalogScreen } from '@/screens/PopupCatalogScreen';
import { QuestionScreen } from '@/screens/QuestionScreen';
import { RewardScreen } from '@/screens/RewardScreen';
import { ReportScreen } from '@/screens/ReportScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { HourPickerScreen, NotificationPrimerScreen } from '@/screens/SetupScreens';
import { GeneratingScreen, SealingScreen, type GeneratingStep } from '@/screens/TransitionScreens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, motion, nativeAnimationDriver, typography, weight } from '@/theme';
import type { Chapter, Night, Report, RouteName } from '@/types';

type Notice = { title: string; body: string } | null;

function LoadingScreen() {
  return (
    <View style={styles.loading} accessibilityLabel="Preparing Thirty Nights">
      <View style={styles.loadingMark}><View style={styles.loadingSeal} /></View>
      <Text style={styles.loadingTitle}>Thirty Nights</Text>
      <Text style={styles.loadingBody}>Preparing your keepsake</Text>
      <ActivityIndicator size="small" color={colors.roseText} style={styles.loadingIndicator} />
    </View>
  );
}

function ThirtyNightsApp() {
  const {
    snapshot, ready, syncing, currentNight, recordedCount, updateReminder, setIntentions, finishOnboarding,
    sealCurrentNight, setAuthDetails, setNotificationsEnabled, setGentleNudge, setBackupNetwork,
    setProcessingConsent, syncNow, loadDemo, resetEverything,
  } = useApp();
  const [route, setRoute] = useState<RouteName>('onboarding');
  const [pendingReport, setPendingReport] = useState(false);
  const [returnAfterAuth, setReturnAfterAuth] = useState<RouteName>('home');
  const [returnAfterTime, setReturnAfterTime] = useState<RouteName>('notification-primer');
  const [notice, setNotice] = useState<Notice>(null);
  const [selectedReportId, setSelectedReportId] = useState<string>();
  const [selectedChapterId, setSelectedChapterId] = useState<string>();
  const [playback, setPlayback] = useState<{ chapter: Chapter; night: Night }>();
  const [newlyEarned, setNewlyEarned] = useState<number>();
  const initialized = useRef(false);
  const nightPlayer = useAudioPlayer();
  const nightPlayerStatus = useAudioPlayerStatus(nightPlayer);

  useEffect(() => {
    if (!ready || initialized.current) return;
    initialized.current = true;
    setRoute(snapshot.onboarded ? 'home' : 'onboarding');
  }, [ready, snapshot.onboarded]);

  useEffect(() => subscribeToNotificationResponses((nightIndex) => {
    setRoute(currentNight.index === nightIndex && currentNight.status === 'today' ? 'question' : 'home');
  }), [currentNight.index, currentNight.status]);

  useEffect(() => {
    if (route === 'auth' && snapshot.authState === 'authenticated') setRoute(returnAfterAuth);
  }, [returnAfterAuth, route, snapshot.authState]);

  const reschedule = useCallback(async () => {
    if (!snapshot.notificationsEnabled) return;
    await scheduleNightlyQuestions({
      hour: snapshot.reminderHour,
      minute: snapshot.reminderMinute,
      startNight: currentNight.index,
      set: snapshot.currentChapter.questionSet,
      nights: snapshot.currentChapter.nights,
      privatePreview: snapshot.notificationPreview === 'private',
    });
  }, [snapshot.notificationsEnabled, snapshot.reminderHour, snapshot.reminderMinute, snapshot.notificationPreview, snapshot.currentChapter.questionSet, snapshot.currentChapter.nights, currentNight.index]);

  useEffect(() => { if (ready) void reschedule().catch(() => undefined); }, [ready, reschedule]);

  // Android's back gesture used to close the app from every screen, because
  // this router has no navigation stack of its own. Back now means what the
  // screen's own back arrow means. The ceremonial routes swallow it: a take
  // being sealed is not something to reverse halfway through.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (notice) { setNotice(null); return true; }
      if (playback) { nightPlayer.pause(); setPlayback(undefined); return true; }

      switch (route) {
        case 'sealing':
        case 'generating':
        // A take being sealed is not something to reverse halfway through, and
        // the reveal that follows it leaves on its own or on its own button.
        case 'reward':
          return true;
        case 'question':
          setRoute('home');
          return true;
        case 'gallery':
        case 'light-map':
        case 'settings':
        case 'paywall':
          setRoute('home');
          return true;
        case 'report':
          setRoute('gallery');
          return true;
        case 'popup-catalog':
          setRoute('settings');
          return true;
        case 'auth':
          setRoute(returnAfterAuth);
          return true;
        case 'intentions':
          setRoute('onboarding');
          return true;
        case 'time-picker':
          setRoute(returnAfterTime === 'settings' ? 'settings' : 'intentions');
          return true;
        // The plan screen is the hand-over: there is nothing behind it worth
        // reversing into, and the app is already set up by the time it shows.
        case 'plan':
          setRoute('home');
          return true;
        // Home and onboarding are the roots: let the system close the app.
        default:
          return false;
      }
    });
    return () => subscription.remove();
  }, [nightPlayer, notice, playback, returnAfterAuth, returnAfterTime, route]);

  if (!ready) return <LoadingScreen />;

  const ownerSetup = (feature: string) => setNotice({
    title: `${feature} needs owner setup.`,
    body: 'The production code is present, but the owner must supply the provider account, public app credentials, products, or published legal URL. The exact action is listed in docs/HANDOVER.md.',
  });

  const openAuth = (from: RouteName) => { setReturnAfterAuth(from); setRoute('auth'); };

  // The permission answer is not the end of onboarding any more: whichever way
  // it goes, the plan screen is what hands the app over. It is the only screen
  // that shows what the questions just built, so skipping it on denial would
  // punish exactly the person who was already hesitant.
  const finishNotificationSetup = async () => {
    try {
      const granted = await requestNotificationPermission();
      finishOnboarding(granted);
      if (granted) await reschedule();
      setRoute('plan');
    } catch (error) {
      finishOnboarding(false);
      setNotice({
        title: 'Notifications are still off.',
        body: error instanceof Error ? error.message : 'You can enable them later from Settings.',
      });
      setRoute('plan');
    }
  };

  const toggleNotifications = (enabled: boolean) => {
    void (async () => {
      if (!enabled) {
        setNotificationsEnabled(false);
        await cancelNightlyQuestions();
        return;
      }
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
      if (granted) await reschedule();
      else setNotice({ title: 'Notifications are off.', body: 'Enable notifications for Thirty Nights in system settings, then try again.' });
    })().catch((error: unknown) => setNotice({
      title: 'Notification settings did not change.',
      body: error instanceof Error ? error.message : 'Please try again.',
    }));
  };

  const allChapters = [snapshot.currentChapter, ...snapshot.completedChapters];
  const reportChapter = allChapters.find((chapter) => chapter.id === selectedChapterId) ?? snapshot.currentChapter;
  const reportRecordedCount = reportChapter.nights.filter(isRecorded).length;
  const reportsForChapter = snapshot.reports
    .filter((report) => report.chapterId === reportChapter.id)
    .sort((a, b) => b.checkpointNight - a.checkpointNight);
  const currentReport: Report | undefined = snapshot.reports.find((report) => report.id === selectedReportId) ?? reportsForChapter[0];

  /**
   * A night is shareable precisely because the sticker carries none of it: no
   * question, no audio, no duration — only that someone showed up. Keep it that
   * way. Anything from the recording itself must never reach this string.
   */
  const shareNight = async (nightIndex: number) => {
    const kept = recordedCount;
    const total = snapshot.currentChapter.targetLength;
    await Share.share({
      title: 'Thirty Nights',
      message: `Night ${nightIndex} kept — ${kept} of ${total}. Thirty Nights, one question a night.`,
    });
  };

  const shareReport = async () => {
    if (!currentReport || currentReport.status !== 'ready') throw new Error('The report is not ready to share.');
    const sections = currentReport.sections.map((section) => `${section.title}\n${section.body}`).join('\n\n');
    await Share.share({ title: `Thirty Nights — ${currentReport.checkpointNight} nights`, message: `${currentReport.summary || ''}\n\n${sections}`.trim() });
  };

  const openExternal = async (url: string | undefined, feature: string) => {
    if (!url || url.includes('replace_me')) return ownerSetup(feature);
    await Linking.openURL(url);
  };

  const openExternalSafely = (url: string | undefined, feature: string) => {
    void openExternal(url, feature).catch((error: unknown) => setNotice({
      title: `${feature} could not open.`,
      body: error instanceof Error ? error.message : 'Please try again.',
    }));
  };

  const playRevealedNight = async () => {
    if (!playback || playback.night.status !== 'revealed') throw new Error('This take has not been revealed yet.');
    if (nightPlayerStatus.playing) return nightPlayer.pause();
    const source = playback.night.localUri ?? (playback.night.storagePath ? await signedRecordingUrl(playback.night.storagePath) : undefined);
    if (!source) throw new Error('This recording is unavailable on this device and has not been backed up.');
    nightPlayer.replace(source);
    nightPlayer.play();
  };

  /** Resolves the raw audio for a revealed night so a report quote can be played
   *  back at the exact moment it came from. */
  const resolveNightAudio = async (nightId: string) => {
    const night = allChapters.flatMap((chapter) => chapter.nights).find((candidate) => candidate.id === nightId);
    if (!night) return undefined;
    if (night.localUri) return night.localUri;
    return night.storagePath ? signedRecordingUrl(night.storagePath) : undefined;
  };

  // Real state, not a timed checklist. Each line reflects something that has
  // actually happened (or deliberately has not).
  const generatingSteps: GeneratingStep[] = (() => {
    const chapterNights = snapshot.currentChapter.nights;
    const sealed = chapterNights.filter(isRecorded);
    const waiting = sealed.filter((night) => !night.backedUp);
    const consented = Boolean(snapshot.processingConsentVersion);
    const recoverable = snapshot.authState === 'authenticated';

    return [
      {
        label: 'Your take is sealed on this device',
        state: 'done',
        detail: `${sealed.length} ${sealed.length === 1 ? 'night' : 'nights'} kept locally${
          currentNight.durationSec ? ` · latest ${formatDuration(currentNight.durationSec)}` : ''}`,
      },
      recoverable
        ? consented
          ? waiting.length
            ? { label: 'Backing up your recordings', state: 'active' as const, detail: `${waiting.length} still to upload` }
            : { label: 'Recordings are backed up', state: 'done' as const }
          : { label: 'Cloud processing not enabled', state: 'skipped' as const, detail: 'Turn it on in Settings → Recording backup' }
        : { label: 'No recoverable account yet', state: 'skipped' as const, detail: 'Raw audio stays on this device until you link one' },
      recoverable && consented && !waiting.length
        ? { label: 'Report queued for writing', state: 'active' as const, detail: 'It appears here as soon as the server finishes' }
        : { label: 'Report not queued', state: 'skipped' as const, detail: 'A report is written only from recordings that are really backed up' },
    ];
  })();

  let screen: ReactNode;
  switch (route) {
    case 'onboarding':
      screen = <OnboardingScreen onComplete={() => setRoute('intentions')} onPreview={__DEV__ && process.env.EXPO_PUBLIC_APP_ENV !== 'production' ? () => { loadDemo('partial'); setRoute('home'); } : undefined} />;
      break;

    case 'intentions':
      screen = (
        <IntentionScreen
          selected={snapshot.intentions ?? []}
          onToggle={(id) => {
            const current = snapshot.intentions ?? [];
            setIntentions(current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
          }}
          onContinue={() => { setReturnAfterTime('notification-primer'); setRoute('time-picker'); }}
          onSkip={() => { setIntentions([]); setReturnAfterTime('notification-primer'); setRoute('time-picker'); }}
        />
      );
      break;

    case 'plan':
      screen = (
        <PlanScreen
          picked={snapshot.intentions ?? []}
          hour={snapshot.reminderHour}
          minute={snapshot.reminderMinute}
          notificationsEnabled={snapshot.notificationsEnabled}
          freeNights={snapshot.currentChapter.targetLength}
          fullLength={30}
          onStart={() => setRoute('home')}
        />
      );
      break;
    case 'time-picker':
      screen = <HourPickerScreen hour={snapshot.reminderHour} minute={snapshot.reminderMinute} onChange={updateReminder} onContinue={() => { void reschedule().catch(() => undefined); setRoute(returnAfterTime); }} />;
      break;
    case 'notification-primer':
      screen = <NotificationPrimerScreen hour={snapshot.reminderHour} minute={snapshot.reminderMinute} nightIndex={currentNight.index} question={questionFor(snapshot.currentChapter.questionSet, currentNight.index)} onAllow={finishNotificationSetup} onSkip={() => { finishOnboarding(false); setRoute('plan'); }} />;
      break;
    case 'question':
      screen = <QuestionScreen nightIndex={currentNight.index} question={questionFor(snapshot.currentChapter.questionSet, currentNight.index)} onBack={() => setRoute('home')} onSeal={async (duration, uri) => { const earned = currentNight.index; const shouldReport = await sealCurrentNight(duration, uri); setNewlyEarned(earned); setSelectedChapterId(undefined); setSelectedReportId(undefined); setPendingReport(shouldReport); setRoute('sealing'); }} />;
      break;
    case 'sealing':
      screen = <SealingScreen nightIndex={newlyEarned ?? currentNight.index} onDone={() => setRoute('reward')} />;
      break;
    case 'reward':
      screen = <RewardScreen nightIndex={newlyEarned ?? currentNight.index} keptCount={recordedCount} targetLength={snapshot.currentChapter.targetLength} onDone={() => setRoute(pendingReport ? 'generating' : 'home')} onShare={() => void shareNight(newlyEarned ?? currentNight.index).catch((error: unknown) => setNotice({ title: 'Could not share.', body: error instanceof Error ? error.message : 'Try again.' }))} />;
      break;
    case 'generating':
      screen = <GeneratingScreen mini={recordedCount === 7} steps={generatingSteps} onDone={() => { void syncNow().catch(() => undefined); setRoute('report'); }} />;
      break;
    case 'report':
      screen = <ReportScreen chapter={reportChapter} report={currentReport} onBack={() => setRoute('gallery')} onResolveAudio={async () => currentReport?.audioUrl ?? (currentReport?.audioPath ? signedReportAudioUrl(currentReport.audioPath) : undefined)} onResolveNightAudio={resolveNightAudio} onShare={() => void shareReport().catch((error: unknown) => setNotice({ title: 'Could not share report.', body: error instanceof Error ? error.message : 'Try again.' }))} onRetry={currentReport?.status === 'failed' ? async () => { await retryReport(currentReport.id); await syncNow(); } : undefined} onContinue={reportChapter.id === snapshot.currentChapter.id && reportRecordedCount < reportChapter.targetLength ? () => setRoute('home') : reportChapter.targetLength === 7 ? () => setRoute('paywall') : undefined} />;
      break;
    case 'gallery':
      screen = <GalleryScreen current={snapshot.currentChapter} completed={snapshot.completedChapters} reports={snapshot.reports} onSettings={() => setRoute('settings')} onReport={(reportId, chapterId) => { setSelectedReportId(reportId); setSelectedChapterId(chapterId); setRoute('report'); }} onPlayNight={(chapter, night) => setPlayback({ chapter, night })} />;
      break;
    case 'light-map':
      screen = <LightMapScreen chapters={[snapshot.currentChapter, ...snapshot.completedChapters]} onSettings={() => setRoute('settings')} />;
      break;
    case 'settings': {
      const unbackedCount = [snapshot.currentChapter, ...snapshot.completedChapters].flatMap((chapter) => chapter.nights).filter((night) => isRecorded(night) && !night.backedUp).length;
      screen = <SettingsScreen reminderHour={snapshot.reminderHour} reminderMinute={snapshot.reminderMinute} notificationsEnabled={snapshot.notificationsEnabled} gentleNudge={snapshot.gentleNudge} authState={snapshot.authState} email={snapshot.email} backupNetwork={snapshot.backupNetwork} processingConsent={Boolean(snapshot.processingConsentVersion)} unbackedCount={unbackedCount} syncing={syncing} showDeveloperControls={__DEV__ && process.env.EXPO_PUBLIC_APP_ENV !== 'production'} onBack={() => setRoute('home')} onAuth={() => openAuth('settings')} onEditReminder={() => { setReturnAfterTime('settings'); setRoute('time-picker'); }} onToggleNotifications={toggleNotifications} onToggleNudge={setGentleNudge} onBackupNetwork={setBackupNetwork} onEnableProcessing={() => { setProcessingConsent('cloud-processing-v1'); void syncNow().catch(() => undefined); }} onSync={syncNow} onRestore={() => setRoute('paywall')} onExport={async () => { const result = await exportEverything(snapshot); if (result.partial) setNotice({ title: 'Partial export prepared.', body: 'The archive includes all metadata and reports, plus every recording available on this device or from cloud backup. At least one raw recording was unavailable.' }); }} onPrivacy={() => openExternalSafely(process.env.EXPO_PUBLIC_PRIVACY_URL, 'Published privacy policy')} onTerms={() => openExternalSafely(process.env.EXPO_PUBLIC_TERMS_URL, 'Published terms of use')} onSupport={() => openExternalSafely(process.env.EXPO_PUBLIC_SUPPORT_URL, 'Published support page')} onWebDelete={() => openExternalSafely(process.env.EXPO_PUBLIC_DELETE_ACCOUNT_URL, 'Web account-deletion page')} onPreview={(mode) => { loadDemo(mode); setRoute(mode === 'complete' ? 'report' : 'home'); }} onPopupCatalog={() => setRoute('popup-catalog')} onPreviewSealing={() => { setPendingReport(false); setRoute('sealing'); }} onDelete={async (remote) => { await resetEverything(remote); initialized.current = true; setRoute('onboarding'); }} />;
      break;
    }
    case 'popup-catalog':
      screen = <PopupCatalogScreen onBack={() => setRoute('settings')} />;
      break;
    case 'paywall':
      screen = <PaywallScreen authState={snapshot.authState} ownerId={snapshot.ownerId} nightsKept={recordedCount} voiceSeconds={totalVoiceSeconds(snapshot.currentChapter.nights)} targetLength={snapshot.currentChapter.targetLength} onBack={() => setRoute('home')} onAuth={() => openAuth('paywall')} onVerifying={async () => { await syncNow(); setRoute('home'); }} onUnavailable={() => ownerSetup('Store products and RevenueCat')} onPrivacy={() => openExternalSafely(process.env.EXPO_PUBLIC_PRIVACY_URL, 'Published privacy policy')} onTerms={() => openExternalSafely(process.env.EXPO_PUBLIC_TERMS_URL, 'Published terms of use')} />;
      break;
    case 'auth':
      screen = <AuthScreen hasLocalRecordings={snapshot.currentChapter.nights.some((night) => Boolean(night.recordedAt))} onBack={() => setRoute(returnAfterAuth)} onAuthenticated={(email, ownerId) => { setAuthDetails(email, undefined, ownerId); setRoute(returnAfterAuth); void syncNow().catch(() => undefined); }} onUnavailable={(provider) => ownerSetup(provider)} />;
      break;
    case 'home':
    default:
      screen = <HomeScreen nights={snapshot.currentChapter.nights} recordedCount={recordedCount} currentNight={currentNight} targetLength={snapshot.currentChapter.targetLength} accessThrough={snapshot.currentChapter.accessThrough} accessTier={snapshot.accessTier} authState={snapshot.authState} syncing={syncing} newlyEarned={newlyEarned} reminderHour={snapshot.reminderHour} reminderMinute={snapshot.reminderMinute} onQuestion={() => setRoute('question')} onSettings={() => setRoute('settings')} onPaywall={() => setRoute('paywall')} />;
  }

  // The ritual routes wear nightfall; their status bar text must be light.
  const nightRoute = route === 'question' || route === 'sealing' || route === 'reward' || route === 'generating';

  return (
    <>
      <StatusBar style={nightRoute ? 'light' : 'dark'} />
      {TAB_ROUTES.includes(route as TabKey) ? (
        <View style={styles.tabHost}>
          <TabScene routeKey={route as TabKey}>{screen}</TabScene>
          {/* box-none so only the island itself catches touches — the page's own
              gradient and any card beneath it stay reachable to either side. */}
          <View style={styles.tabDock} pointerEvents="box-none">
            <TabBar active={route as TabKey} onChange={(key) => setRoute(key)} />
          </View>
        </View>
      ) : screen}
      <BottomSheet visible={Boolean(notice)} title={notice?.title ?? ''} body={notice?.body} actions={[{ label: 'Close', variant: 'outline', onPress: () => setNotice(null) }]} onClose={() => setNotice(null)} />
      <BottomSheet
        visible={Boolean(playback)}
        title={playback ? `Night ${playback.night.index}` : ''}
        body={playback ? `${playback.night.expectedLocalDate} · ${formatDuration(playback.night.durationSec ?? 0)} · ${playback.night.backedUp ? 'Backed up' : 'On this device'}` : undefined}
        actions={[
          { label: nightPlayerStatus.playing ? 'Pause' : 'Play revealed take', onPress: () => void playRevealedNight().catch((error: unknown) => setNotice({ title: 'Could not play recording.', body: error instanceof Error ? error.message : 'Try again.' })) },
          { label: 'Close', variant: 'outline', onPress: () => { nightPlayer.pause(); setPlayback(undefined); } },
        ]}
        onClose={() => { nightPlayer.pause(); setPlayback(undefined); }}
      />
    </>
  );
}

const TAB_ROUTES: TabKey[] = ['gallery', 'home', 'light-map'];

/**
 * A room arrives from the side it sits on: reach left for the Gallery and it
 * enters from the left. Without that, three tabs sharing one hand-rolled router
 * would cross-fade identically and the bar would be the only clue anything
 * moved. The drift is small — the screens run their own staggered entrance on
 * top of it, and two large motions at once reads as a lurch.
 */
function TabScene({ routeKey, children }: { routeKey: TabKey; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const index = TAB_ROUTES.indexOf(routeKey);
  const enter = useRef(new Animated.Value(1)).current;
  const previous = useRef(index);
  const direction = useRef(0);

  // Reset before paint rather than in an effect: an effect lands a frame late,
  // which shows the new screen fully arrived and then yanks it back to start.
  if (previous.current !== index) {
    direction.current = index > previous.current ? 1 : -1;
    previous.current = index;
    if (!reducedMotion) enter.setValue(0);
  }

  useEffect(() => {
    if (reducedMotion) {
      enter.setValue(1);
      return;
    }
    const arrival = Animated.timing(enter, {
      toValue: 1,
      duration: motion.slow,
      easing: motion.easeGentle,
      useNativeDriver: nativeAnimationDriver,
    });
    arrival.start();
    return () => arrival.stop();
  }, [enter, index, reducedMotion]);

  const offset = useMemo(() => 22 * direction.current, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      style={[
        styles.tabScene,
        {
          opacity: enter,
          transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular, Fraunces_400Regular_Italic, Fraunces_500Medium, Fraunces_600SemiBold,
    DMMono_400Regular, DMMono_500Medium,
  });
  const [resetKey, setResetKey] = useState(0);

  // The root view behind the app — visible during transitions and overscroll —
  // should be the app's own paper, not the platform default.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.ink).catch(() => undefined);
  }, []);

  if (!fontsLoaded) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary key={resetKey} onReset={() => setResetKey((value) => value + 1)}>
        <AppProvider>
          <ThirtyNightsApp />
        </AppProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabHost: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  tabScene: {
    flex: 1,
  },
  /** The island hovers over the page rather than sitting in a column beside it,
   *  so the paper gradient and its watercolour blooms run on beneath the glass
   *  instead of stopping at a seam. */
  tabDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    padding: 32,
  },
  loadingMark: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,188,195,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  loadingSeal: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.roseDeep,
    borderWidth: 5,
    borderColor: colors.blush,
  },
  loadingTitle: {
    marginTop: 20,
    color: colors.bone,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 28,
    letterSpacing: -0.4,
  },
  loadingBody: {
    marginTop: 5,
    color: colors.boneDim,
    fontFamily: typography.sans,
    fontWeight: weight.medium,
    fontSize: 14,
  },
  loadingIndicator: { marginTop: 20 },
});
