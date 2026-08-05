import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Share, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Fraunces_400Regular, Fraunces_400Regular_Italic, Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';

import { BottomSheet } from '@/components/BottomSheet';
import { AppProvider, useApp } from '@/context/AppContext';
import { questionFor } from '@/data/questions';
import { formatDuration } from '@/domain/format';
import { isRecorded } from '@/domain/stats';
import { retryReport, signedRecordingUrl, signedReportAudioUrl } from '@/lib/supabase';
import { exportEverything } from '@/services/exportData';
import { cancelNightlyQuestions, requestNotificationPermission, scheduleNightlyQuestions, subscribeToNotificationResponses } from '@/services/notifications';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { GalleryScreen, LightMapScreen } from '@/screens/ArchiveScreens';
import { AuthScreen } from '@/screens/AuthScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { PaywallScreen } from '@/screens/PaywallScreen';
import { PopupCatalogScreen } from '@/screens/PopupCatalogScreen';
import { QuestionScreen } from '@/screens/QuestionScreen';
import { ReportScreen } from '@/screens/ReportScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { HourPickerScreen, NotificationPrimerScreen } from '@/screens/SetupScreens';
import { GeneratingScreen, SealingScreen, type GeneratingStep } from '@/screens/TransitionScreens';
import { colors } from '@/theme';
import type { Chapter, Night, Report, RouteName } from '@/types';

type Notice = { title: string; body: string } | null;

function ThirtyNightsApp() {
  const {
    snapshot, ready, syncing, currentNight, recordedCount, updateReminder, finishOnboarding,
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

  useEffect(() => { if (ready) void reschedule(); }, [ready, reschedule]);

  if (!ready) return <View style={styles.loading}><ActivityIndicator color={colors.brass} /></View>;

  const ownerSetup = (feature: string) => setNotice({
    title: `${feature} needs owner setup.`,
    body: 'The production code is present, but the owner must supply the provider account, public app credentials, products, or published legal URL. The exact action is listed in docs/HANDOVER.md.',
  });

  const openAuth = (from: RouteName) => { setReturnAfterAuth(from); setRoute('auth'); };

  const finishNotificationSetup = async () => {
    const granted = await requestNotificationPermission();
    finishOnboarding(granted);
    if (granted) await reschedule();
    setRoute('home');
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
    })();
  };

  const allChapters = [snapshot.currentChapter, ...snapshot.completedChapters];
  const reportChapter = allChapters.find((chapter) => chapter.id === selectedChapterId) ?? snapshot.currentChapter;
  const reportRecordedCount = reportChapter.nights.filter(isRecorded).length;
  const reportsForChapter = snapshot.reports
    .filter((report) => report.chapterId === reportChapter.id)
    .sort((a, b) => b.checkpointNight - a.checkpointNight);
  const currentReport: Report | undefined = snapshot.reports.find((report) => report.id === selectedReportId) ?? reportsForChapter[0];

  const shareReport = async () => {
    if (!currentReport || currentReport.status !== 'ready') throw new Error('The report is not ready to share.');
    const sections = currentReport.sections.map((section) => `${section.title}\n${section.body}`).join('\n\n');
    await Share.share({ title: `Thirty Nights — ${currentReport.checkpointNight} nights`, message: `${currentReport.summary || ''}\n\n${sections}`.trim() });
  };

  const openExternal = async (url: string | undefined, feature: string) => {
    if (!url || url.includes('replace_me')) return ownerSetup(feature);
    await Linking.openURL(url);
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
      screen = <OnboardingScreen onComplete={() => { setReturnAfterTime('notification-primer'); setRoute('time-picker'); }} onPreview={__DEV__ && process.env.EXPO_PUBLIC_APP_ENV !== 'production' ? () => { loadDemo('partial'); setRoute('home'); } : undefined} />;
      break;
    case 'time-picker':
      screen = <HourPickerScreen hour={snapshot.reminderHour} minute={snapshot.reminderMinute} onChange={updateReminder} onContinue={() => { void reschedule(); setRoute(returnAfterTime); }} />;
      break;
    case 'notification-primer':
      screen = <NotificationPrimerScreen hour={snapshot.reminderHour} minute={snapshot.reminderMinute} nightIndex={currentNight.index} question={questionFor(snapshot.currentChapter.questionSet, currentNight.index)} onAllow={finishNotificationSetup} onSkip={() => { finishOnboarding(false); setRoute('home'); }} />;
      break;
    case 'question':
      screen = <QuestionScreen nightIndex={currentNight.index} question={questionFor(snapshot.currentChapter.questionSet, currentNight.index)} onBack={() => setRoute('home')} onSeal={async (duration, uri) => { const earned = currentNight.index; const shouldReport = await sealCurrentNight(duration, uri); setNewlyEarned(earned); setSelectedChapterId(undefined); setSelectedReportId(undefined); setPendingReport(shouldReport); setRoute('sealing'); }} />;
      break;
    case 'sealing':
      screen = <SealingScreen onDone={() => setRoute(pendingReport ? 'generating' : 'home')} />;
      break;
    case 'generating':
      screen = <GeneratingScreen mini={recordedCount === 7} steps={generatingSteps} onDone={() => { void syncNow(); setRoute('report'); }} />;
      break;
    case 'report':
      screen = <ReportScreen chapter={reportChapter} report={currentReport} onBack={() => setRoute('gallery')} onResolveAudio={async () => currentReport?.audioUrl ?? (currentReport?.audioPath ? signedReportAudioUrl(currentReport.audioPath) : undefined)} onResolveNightAudio={resolveNightAudio} onShare={() => void shareReport().catch((error: unknown) => setNotice({ title: 'Could not share report.', body: error instanceof Error ? error.message : 'Try again.' }))} onRetry={currentReport?.status === 'failed' ? async () => { await retryReport(currentReport.id); await syncNow(); } : undefined} onContinue={reportChapter.id === snapshot.currentChapter.id && reportRecordedCount < reportChapter.targetLength ? () => setRoute('home') : reportChapter.targetLength === 7 ? () => setRoute('paywall') : undefined} />;
      break;
    case 'gallery':
      screen = <GalleryScreen current={snapshot.currentChapter} completed={snapshot.completedChapters} reports={snapshot.reports} onBack={() => setRoute('home')} onSettings={() => setRoute('settings')} onLightMap={() => setRoute('light-map')} onReport={(reportId, chapterId) => { setSelectedReportId(reportId); setSelectedChapterId(chapterId); setRoute('report'); }} onPlayNight={(chapter, night) => setPlayback({ chapter, night })} />;
      break;
    case 'light-map':
      screen = <LightMapScreen chapters={[snapshot.currentChapter, ...snapshot.completedChapters]} onBack={() => setRoute('home')} onSettings={() => setRoute('settings')} onGallery={() => setRoute('gallery')} />;
      break;
    case 'settings': {
      const unbackedCount = [snapshot.currentChapter, ...snapshot.completedChapters].flatMap((chapter) => chapter.nights).filter((night) => isRecorded(night) && !night.backedUp).length;
      screen = <SettingsScreen reminderHour={snapshot.reminderHour} reminderMinute={snapshot.reminderMinute} notificationsEnabled={snapshot.notificationsEnabled} gentleNudge={snapshot.gentleNudge} authState={snapshot.authState} email={snapshot.email} backupNetwork={snapshot.backupNetwork} processingConsent={Boolean(snapshot.processingConsentVersion)} unbackedCount={unbackedCount} syncing={syncing} showDeveloperControls={__DEV__ && process.env.EXPO_PUBLIC_APP_ENV !== 'production'} onBack={() => setRoute('home')} onAuth={() => openAuth('settings')} onEditReminder={() => { setReturnAfterTime('settings'); setRoute('time-picker'); }} onToggleNotifications={toggleNotifications} onToggleNudge={setGentleNudge} onBackupNetwork={setBackupNetwork} onEnableProcessing={() => { setProcessingConsent('cloud-processing-v1'); void syncNow(); }} onSync={syncNow} onRestore={() => setRoute('paywall')} onExport={async () => { const result = await exportEverything(snapshot); if (result.partial) setNotice({ title: 'Partial export prepared.', body: 'The archive includes all metadata and reports, plus every recording available on this device or from cloud backup. At least one raw recording was unavailable.' }); }} onPrivacy={() => void openExternal(process.env.EXPO_PUBLIC_PRIVACY_URL, 'Published privacy policy')} onTerms={() => void openExternal(process.env.EXPO_PUBLIC_TERMS_URL, 'Published terms of use')} onSupport={() => void openExternal(process.env.EXPO_PUBLIC_SUPPORT_URL, 'Published support page')} onWebDelete={() => void openExternal(process.env.EXPO_PUBLIC_DELETE_ACCOUNT_URL, 'Web account-deletion page')} onPreview={(mode) => { loadDemo(mode); setRoute(mode === 'complete' ? 'report' : 'home'); }} onPopupCatalog={() => setRoute('popup-catalog')} onPreviewSealing={() => { setPendingReport(false); setRoute('sealing'); }} onDelete={async (remote) => { await resetEverything(remote); initialized.current = true; setRoute('onboarding'); }} />;
      break;
    }
    case 'popup-catalog':
      screen = <PopupCatalogScreen onBack={() => setRoute('settings')} />;
      break;
    case 'paywall':
      screen = <PaywallScreen authState={snapshot.authState} ownerId={snapshot.ownerId} onBack={() => setRoute('home')} onAuth={() => openAuth('paywall')} onVerifying={async () => { await syncNow(); setRoute('home'); }} onUnavailable={() => ownerSetup('Store products and RevenueCat')} />;
      break;
    case 'auth':
      screen = <AuthScreen hasLocalRecordings={snapshot.currentChapter.nights.some((night) => Boolean(night.recordedAt))} onBack={() => setRoute(returnAfterAuth)} onAuthenticated={(email, ownerId) => { setAuthDetails(email, undefined, ownerId); setRoute(returnAfterAuth); void syncNow(); }} onUnavailable={(provider) => ownerSetup(provider)} />;
      break;
    case 'home':
    default:
      screen = <HomeScreen nights={snapshot.currentChapter.nights} recordedCount={recordedCount} currentNight={currentNight} targetLength={snapshot.currentChapter.targetLength} accessThrough={snapshot.currentChapter.accessThrough} accessTier={snapshot.accessTier} authState={snapshot.authState} syncing={syncing} newlyEarned={newlyEarned} onQuestion={() => setRoute('question')} onSettings={() => setRoute('settings')} onGallery={() => setRoute('gallery')} onLightMap={() => setRoute('light-map')} onPaywall={() => setRoute('paywall')} />;
  }

  return (
    <>
      <StatusBar style="dark" />
      {screen}
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
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brass} />
      </View>
    );
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

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink } });
