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
import { reflectionReadiness, reflectionSetupIncomplete, shouldShowBackupReminder, shouldShowFirstReflectionSetup } from '@/domain/conversion';
import { formatDuration } from '@/domain/format';
import { isRecorded } from '@/domain/stats';
import { retryReport, signedRecordingUrl, signedReportAudioUrl } from '@/lib/supabase';
import { exportEverything } from '@/services/exportData';
import { isPurchaseIntentResumable } from '@/services/commerce';
import { cancelNightlyQuestions, requestNotificationPermission, scheduleNightlyQuestions, subscribeToNotificationResponses } from '@/services/notifications';
import { trackAnalyticsEvent } from '@/services/analytics';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { GalleryScreen, LightMapScreen } from '@/screens/ArchiveScreens';
import { AuthScreen } from '@/screens/AuthScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { PaywallScreen } from '@/screens/PaywallScreen';
import { PurchaseSuccessScreen, ReflectionSetupScreen } from '@/screens/ConversionScreens';
import { DevRecordingsScreen } from '@/screens/DevRecordingsScreen';
import { PopupCatalogScreen } from '@/screens/PopupCatalogScreen';
import { QuestionScreen } from '@/screens/QuestionScreen';
import { RewardScreen } from '@/screens/RewardScreen';
import { ReportScreen } from '@/screens/ReportScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { HourPickerScreen } from '@/screens/SetupScreens';
import { GeneratingScreen, SealingScreen, type GeneratingStep } from '@/screens/TransitionScreens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, motion, nativeAnimationDriver, typography, weight } from '@/theme';
import type { Chapter, Night, PaywallSource, Report, RouteName } from '@/types';

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
    snapshot, ready, syncing, currentNight, recordedCount, updateReminder, finishOnboarding,
    sealCurrentNight, setAuthDetails, setNotificationsEnabled, setGentleNudge, setBackupNetwork,
    setProcessingConsent, syncNow, refreshFromCloud, refreshEntitlement, verifyPurchase, markReportSetupPromptShown,
    markBackupPromptShown, setPaywallSource, setPurchaseIntent, setPurchaseVerification,
    setRestoreResult, acknowledgePurchaseSuccess, loadDemo, exitDemo, advanceOneNight, resetEverything,
  } = useApp();
  const [route, setRoute] = useState<RouteName>('onboarding');
  const [pendingReport, setPendingReport] = useState(false);
  const [returnAfterAuth, setReturnAfterAuth] = useState<RouteName>('home');
  const [returnAfterTime, setReturnAfterTime] = useState<'onboarding' | 'settings'>('onboarding');
  const [notice, setNotice] = useState<Notice>(null);
  const [selectedReportId, setSelectedReportId] = useState<string>();
  const [selectedChapterId, setSelectedChapterId] = useState<string>();
  const [playback, setPlayback] = useState<{ chapter: Chapter; night: Night }>();
  const [newlyEarned, setNewlyEarned] = useState<number>();
  const [backupReminder, setBackupReminder] = useState(false);
  const initialized = useRef(false);
  const lastUploadState = useRef('');
  const trackedReportStates = useRef(new Set<string>());
  const trackedMissedMilestones = useRef(new Set<number>());
  const nightPlayer = useAudioPlayer();
  const nightPlayerStatus = useAudioPlayerStatus(nightPlayer);
  const readiness = useMemo(() => reflectionReadiness(snapshot), [snapshot]);

  useEffect(() => {
    if (!ready || initialized.current) return;
    initialized.current = true;
    if (!snapshot.onboarded) trackAnalyticsEvent('app_first_opened');
    const resumableIntent = isPurchaseIntentResumable(snapshot.purchaseIntent) ? snapshot.purchaseIntent : undefined;
    if (snapshot.purchaseIntent && !resumableIntent) setPurchaseIntent(undefined);
    if (snapshot.purchaseSuccessPending) {
      setRoute('purchase-success');
      return;
    }
    if (resumableIntent) {
      setReturnAfterAuth('paywall');
      setRoute(snapshot.authState === 'authenticated' ? 'paywall' : 'auth');
      return;
    }
    setRoute(!snapshot.onboarded
      ? 'onboarding'
      : shouldShowFirstReflectionSetup(snapshot) ? 'report-setup' : 'home');
  }, [ready, setPurchaseIntent, snapshot]);

  useEffect(() => {
    if (!ready || !snapshot.onboarded || snapshot.demoMode || !readiness.recordedCount) return;
    const key = `${readiness.state}:${readiness.unbackedCount}:${readiness.backedUpCount}`;
    if (lastUploadState.current === key) return;
    lastUploadState.current = key;
    if (readiness.state === 'account-needed') {
      trackAnalyticsEvent('upload_waiting', { itemCount: readiness.unbackedCount, reason: 'account' });
    } else if (readiness.state === 'consent-needed') {
      trackAnalyticsEvent('upload_waiting', { itemCount: readiness.unbackedCount, reason: 'consent' });
    } else if (readiness.state === 'waiting-network') {
      trackAnalyticsEvent('upload_waiting', { itemCount: readiness.unbackedCount, reason: 'network' });
    } else if (readiness.state === 'uploading') {
      trackAnalyticsEvent('upload_started', { itemCount: readiness.unbackedCount });
    } else if (readiness.state === 'attention') {
      trackAnalyticsEvent('upload_failed', { itemCount: readiness.unbackedCount });
    } else if (readiness.unbackedCount === 0) {
      trackAnalyticsEvent('upload_completed', { itemCount: readiness.backedUpCount });
    }
  }, [readiness, ready, snapshot.demoMode, snapshot.onboarded]);

  useEffect(() => {
    if (!ready || snapshot.demoMode) return;
    for (const report of snapshot.reports) {
      const key = `${report.id}:${report.status}`;
      if (trackedReportStates.current.has(key)) continue;
      trackedReportStates.current.add(key);
      if (report.status === 'queued') trackAnalyticsEvent('checkpoint_report_queued', { checkpoint: report.checkpointNight });
      if (report.status === 'ready') trackAnalyticsEvent('checkpoint_report_ready', { checkpoint: report.checkpointNight });
      if (report.status === 'failed') trackAnalyticsEvent('checkpoint_report_failed', { checkpoint: report.checkpointNight });
    }
  }, [ready, snapshot.demoMode, snapshot.reports]);

  useEffect(() => {
    if (!ready || snapshot.demoMode) return;
    const milestones = [3, 6, 7, 8, 30, 60, 90] as const;
    for (const night of snapshot.currentChapter.nights) {
      if (night.status !== 'missed' || !milestones.includes(night.index as typeof milestones[number])) continue;
      if (trackedMissedMilestones.current.has(night.index)) continue;
      trackedMissedMilestones.current.add(night.index);
      trackAnalyticsEvent('milestone_night_missed', { night: night.index as typeof milestones[number] });
    }
  }, [ready, snapshot.currentChapter.nights, snapshot.demoMode]);

  useEffect(() => {
    if (snapshot.purchaseSuccessPending && route !== 'auth' && route !== 'purchase-success') setRoute('purchase-success');
  }, [route, snapshot.purchaseSuccessPending]);

  useEffect(() => {
    if (route !== 'home' || backupReminder || !shouldShowBackupReminder(snapshot)) return;
    setBackupReminder(true);
  }, [backupReminder, route, snapshot]);

  useEffect(() => subscribeToNotificationResponses((nightIndex) => {
    setRoute(!snapshot.demoMode && currentNight.index === nightIndex && currentNight.status === 'today' ? 'question' : 'home');
  }), [currentNight.index, currentNight.status, snapshot.demoMode]);

  useEffect(() => {
    if (snapshot.demoMode && (route === 'question' || route === 'report-setup')) setRoute('home');
  }, [route, snapshot.demoMode]);

  useEffect(() => {
    // A resumed checkout must hydrate authoritative access before the paywall
    // is allowed to replay its exact store action. AuthScreen performs that
    // refresh and routes after it completes.
    if (route === 'auth' && snapshot.authState === 'authenticated' && returnAfterAuth !== 'paywall') setRoute(returnAfterAuth);
  }, [returnAfterAuth, route, snapshot.authState]);

  const reschedule = useCallback(async () => {
    if (!snapshot.notificationsEnabled || snapshot.demoMode) return;
    await scheduleNightlyQuestions({
      hour: snapshot.reminderHour,
      minute: snapshot.reminderMinute,
      startNight: currentNight.index,
      set: snapshot.currentChapter.questionSet,
      nights: snapshot.currentChapter.nights,
      privatePreview: snapshot.notificationPreview === 'private',
    });
  }, [snapshot.notificationsEnabled, snapshot.demoMode, snapshot.reminderHour, snapshot.reminderMinute, snapshot.notificationPreview, snapshot.currentChapter.questionSet, snapshot.currentChapter.nights, currentNight.index]);

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
        case 'report-setup':
          setRoute('home');
          return true;
        case 'paywall':
          setPurchaseIntent(undefined);
          setRoute('home');
          return true;
        case 'purchase-success':
          acknowledgePurchaseSuccess();
          setRoute('home');
          return true;
        case 'report':
          setRoute('gallery');
          return true;
        case 'popup-catalog':
        case 'dev-recordings':
          setRoute('settings');
          return true;
        case 'auth':
          if (returnAfterAuth === 'paywall') {
            setPurchaseIntent(undefined);
            setRoute('home');
          } else {
            setRoute(returnAfterAuth);
          }
          return true;
        case 'time-picker':
          setRoute(returnAfterTime === 'settings' ? 'settings' : 'onboarding');
          return true;
        // Home and onboarding are the roots: let the system close the app.
        default:
          return false;
      }
    });
    return () => subscription.remove();
  }, [acknowledgePurchaseSuccess, nightPlayer, notice, playback, returnAfterAuth, returnAfterTime, route, setPurchaseIntent]);

  if (!ready) return <LoadingScreen />;

  const ownerSetup = (feature: string) => setNotice({
    title: `${feature} needs owner setup.`,
    body: 'The production code is present, but the owner must supply the provider account, public app credentials, products, or published legal URL. The exact action is listed in docs/HANDOVER.md.',
  });

  const openAuth = (from: RouteName) => { setReturnAfterAuth(from); setRoute('auth'); };
  const openPaywall = (source: PaywallSource) => {
    if (source === 'locked_night8') trackAnalyticsEvent('locked_night_8_tapped');
    setPurchaseIntent(undefined);
    setPaywallSource(source);
    setRoute('paywall');
  };

  const finishNotificationSetup = async () => {
    try {
      trackAnalyticsEvent('notification_prompt_shown');
      const granted = await requestNotificationPermission();
      trackAnalyticsEvent(granted ? 'notification_permission_granted' : 'notification_permission_denied');
      finishOnboarding(granted);
      trackAnalyticsEvent('onboarding_completed', { step: 'reminder', version: 2 });
      if (granted) await reschedule();
      setRoute('home');
    } catch (error) {
      trackAnalyticsEvent('notification_permission_denied');
      finishOnboarding(false);
      trackAnalyticsEvent('onboarding_completed', { step: 'reminder', version: 2 });
      setNotice({
        title: 'Notifications are still off.',
        body: error instanceof Error ? error.message : 'You can enable them later from Settings.',
      });
      setRoute('home');
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
    const total = snapshot.accessTier === 'trial' ? 30 : snapshot.currentChapter.targetLength;
    await Share.share({
      title: 'Thirty Nights',
      message: `Night ${nightIndex} kept — ${kept} of ${total}. Thirty Nights, one question a night.`,
    });
  };

  const shareReport = async () => {
    if (!currentReport || currentReport.status !== 'ready') throw new Error('The report is not ready to share.');
    const sections = currentReport.sections.map((section) => [section.title, section.body, section.guidance ? `Try this next: ${section.guidance}` : ''].filter(Boolean).join('\n')).join('\n\n');
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
          : { label: 'Reflection processing permission needed', state: 'skipped' as const, detail: 'Open the setup checklist here to review and enable it' }
        : { label: 'No recoverable account yet', state: 'skipped' as const, detail: 'Raw audio stays on this device until you link one' },
      recoverable && consented && !waiting.length
        ? { label: 'Report queued for writing', state: 'active' as const, detail: 'It appears here as soon as the server finishes' }
        : { label: 'Report not queued', state: 'skipped' as const, detail: 'A report is written only from recordings that are really backed up' },
    ];
  })();

  const finishReward = () => {
    if (pendingReport) {
      setRoute('generating');
      return;
    }
    // "First" means the first successful recording, not calendar Night 1. If
    // an earlier night was missed, the same contextual setup still belongs
    // immediately after the first take that was actually sealed.
    if (shouldShowFirstReflectionSetup(snapshot)) {
      setRoute('report-setup');
      return;
    }
    setRoute('home');
  };

  let screen: ReactNode;
  switch (route) {
    case 'onboarding':
      screen = <OnboardingScreen onComplete={() => { setReturnAfterTime('onboarding'); setRoute('time-picker'); }} onPreview={__DEV__ && process.env.EXPO_PUBLIC_APP_ENV !== 'production' ? () => { loadDemo('partial'); setRoute('home'); } : undefined} />;
      break;
    case 'time-picker':
      screen = (
        <HourPickerScreen
          hour={snapshot.reminderHour}
          minute={snapshot.reminderMinute}
          onChange={updateReminder}
          onContinue={() => { void reschedule().catch(() => undefined); setRoute(returnAfterTime); }}
          notification={returnAfterTime === 'onboarding' ? {
            nightIndex: currentNight.index,
            question: snapshot.notificationPreview === 'private'
              ? 'Your nightly question is waiting.'
              : questionFor(snapshot.currentChapter.questionSet, currentNight.index),
            onAllow: async () => {
              trackAnalyticsEvent('reminder_time_accepted');
              await finishNotificationSetup();
            },
            onSkip: () => {
              trackAnalyticsEvent('reminder_time_accepted');
              trackAnalyticsEvent('onboarding_skipped', { step: 'reminder', version: 2 });
              finishOnboarding(false);
              setRoute('home');
            },
          } : undefined}
        />
      );
      break;
    case 'question':
      screen = <QuestionScreen nightIndex={currentNight.index} question={questionFor(snapshot.currentChapter.questionSet, currentNight.index)} onBack={() => setRoute('home')} onSeal={async (duration, uri) => { const earned = currentNight.index; const first = recordedCount === 0; const shouldReport = await sealCurrentNight(duration, uri); if (first) trackAnalyticsEvent('first_recording_sealed'); const milestones = [3, 6, 7, 8, 30, 60, 90] as const; if (milestones.includes(earned as typeof milestones[number])) trackAnalyticsEvent('milestone_night_sealed', { night: earned as typeof milestones[number] }); setNewlyEarned(earned); setSelectedChapterId(undefined); setSelectedReportId(undefined); setPendingReport(shouldReport); setRoute('sealing'); }} />;
      break;
    case 'sealing':
      screen = <SealingScreen nightIndex={newlyEarned ?? currentNight.index} onDone={() => setRoute('reward')} />;
      break;
    case 'reward':
      screen = <RewardScreen nightIndex={newlyEarned ?? currentNight.index} keptCount={recordedCount} targetLength={snapshot.currentChapter.targetLength} onDone={finishReward} onShare={() => void shareNight(newlyEarned ?? currentNight.index).catch((error: unknown) => setNotice({ title: 'Could not share.', body: error instanceof Error ? error.message : 'Try again.' }))} />;
      break;
    case 'generating':
      screen = (
        <GeneratingScreen
          mini={(snapshot.unresolvedCheckpoint ?? recordedCount) === 7}
          steps={generatingSteps}
          onDone={() => { void refreshFromCloud().catch(() => undefined); setRoute('report'); }}
          onSetup={reflectionSetupIncomplete(snapshot) ? () => setRoute('report-setup') : undefined}
          onRetry={readiness.state === 'attention' ? () => void refreshFromCloud().catch(() => undefined) : undefined}
        />
      );
      break;
    case 'report':
      screen = (
        <ReportScreen
          chapter={reportChapter}
          report={currentReport}
          onBack={() => setRoute('gallery')}
          onResolveAudio={async () => currentReport?.audioUrl ?? (currentReport?.audioPath ? signedReportAudioUrl(currentReport.audioPath) : undefined)}
          onResolveNightAudio={resolveNightAudio}
          onShare={() => void shareReport().catch((error: unknown) => setNotice({ title: 'Could not share report.', body: error instanceof Error ? error.message : 'Try again.' }))}
          onRetry={currentReport?.status === 'failed' ? async () => { await retryReport(currentReport.id); await refreshFromCloud(); } : undefined}
          onSetup={reportChapter.id === snapshot.currentChapter.id && reflectionSetupIncomplete(snapshot) ? () => setRoute('report-setup') : undefined}
          onContinue={reportChapter.id === snapshot.currentChapter.id && snapshot.accessTier === 'trial'
            ? () => openPaywall('night7_report')
            : reportRecordedCount < reportChapter.targetLength ? () => setRoute('home') : undefined}
        />
      );
      break;
    case 'gallery':
      screen = <GalleryScreen current={snapshot.currentChapter} completed={snapshot.completedChapters} reports={snapshot.reports} unresolvedCheckpoint={snapshot.unresolvedCheckpoint} onSettings={() => setRoute('settings')} onReport={(reportId, chapterId) => { setSelectedReportId(reportId); setSelectedChapterId(chapterId); setRoute('report'); }} onCheckpoint={() => { setSelectedChapterId(snapshot.currentChapter.id); setSelectedReportId(readiness.report?.id); setRoute(reflectionSetupIncomplete(snapshot) ? 'report-setup' : readiness.report ? 'report' : 'generating'); }} onPlayNight={(chapter, night) => setPlayback({ chapter, night })} />;
      break;
    case 'light-map':
      screen = <LightMapScreen chapters={[snapshot.currentChapter, ...snapshot.completedChapters]} onSettings={() => setRoute('settings')} />;
      break;
    case 'settings': {
      const unbackedCount = [snapshot.currentChapter, ...snapshot.completedChapters].flatMap((chapter) => chapter.nights).filter((night) => isRecorded(night) && !night.backedUp).length;
      screen = (
        <SettingsScreen
          reminderHour={snapshot.reminderHour}
          reminderMinute={snapshot.reminderMinute}
          notificationsEnabled={snapshot.notificationsEnabled}
          gentleNudge={snapshot.gentleNudge}
          authState={snapshot.authState}
          email={snapshot.email}
          backupNetwork={snapshot.backupNetwork}
          processingConsent={Boolean(snapshot.processingConsentVersion)}
          unbackedCount={unbackedCount}
          syncing={syncing}
          showDeveloperControls={__DEV__ && process.env.EXPO_PUBLIC_APP_ENV !== 'production'}
          demoMode={snapshot.demoMode}
          previewRecordingCount={snapshot.demoMode
            ? snapshot.currentChapter.nights.filter((night) => Boolean(night.localUri)).length
            : 0}
          onBack={() => setRoute('home')}
          onAuth={() => openAuth('settings')}
          onEditReminder={() => { setReturnAfterTime('settings'); setRoute('time-picker'); }}
          onToggleNotifications={toggleNotifications}
          onToggleNudge={setGentleNudge}
          onBackupNetwork={setBackupNetwork}
          onEnableProcessing={() => {
            void setProcessingConsent('cloud-processing-v2')
              .then(() => {
                trackAnalyticsEvent('processing_permission_accepted', { disclosureVersion: 2 });
                return refreshFromCloud();
              })
              .catch((error: unknown) => setNotice({
                title: 'Processing permission was not enabled.',
                body: error instanceof Error ? error.message : 'Please reconnect and try again.',
              }));
          }}
          onDisableProcessing={() => {
            void setProcessingConsent(undefined)
              .then(() => { trackAnalyticsEvent('processing_permission_withdrawn', { disclosureVersion: 2 }); })
              .catch((error: unknown) => setNotice({
                title: 'Withdrawal did not reach the server.',
                body: error instanceof Error ? error.message : 'Please reconnect and try again. Processing remains enabled until this succeeds.',
              }));
          }}
          onSync={syncNow}
          onRestore={() => openPaywall('settings_restore')}
          onExport={async () => {
            const result = await exportEverything(snapshot);
            if (result.partial) {
              setNotice({
                title: 'Partial export prepared.',
                body: 'The archive includes all metadata and reports, plus every recording available on this device or from cloud backup. At least one raw recording was unavailable.',
              });
            }
          }}
          onPrivacy={() => openExternalSafely(process.env.EXPO_PUBLIC_PRIVACY_URL, 'Published privacy policy')}
          onTerms={() => openExternalSafely(process.env.EXPO_PUBLIC_TERMS_URL, 'Published terms of use')}
          onSupport={() => openExternalSafely(process.env.EXPO_PUBLIC_SUPPORT_URL, 'Published support page')}
          onWebDelete={() => openExternalSafely(process.env.EXPO_PUBLIC_DELETE_ACCOUNT_URL, 'Web account-deletion page')}
          onPreview={(mode) => { loadDemo(mode); setRoute(mode === 'complete' ? 'report' : 'home'); }}
          onExitPreview={async (discard) => {
            const onboarded = await exitDemo(discard);
            setRoute(onboarded ? 'home' : 'onboarding');
          }}
          onPopupCatalog={() => setRoute('popup-catalog')}
          onDevRecordings={() => setRoute('dev-recordings')}
          onAdvanceNight={() => { advanceOneNight(); setRoute('home'); }}
          onPreviewSealing={() => { setPendingReport(false); setRoute('sealing'); }}
          onDelete={async (remote) => {
            await resetEverything(remote);
            await cancelNightlyQuestions().catch(() => undefined);
            initialized.current = true;
            setRoute('onboarding');
          }}
        />
      );
      break;
    }
    case 'popup-catalog':
      screen = <PopupCatalogScreen onBack={() => setRoute('settings')} />;
      break;
    case 'dev-recordings':
      screen = <DevRecordingsScreen chapters={allChapters} onBack={() => setRoute('settings')} />;
      break;
    case 'report-setup':
      screen = (
        <ReflectionSetupScreen
          readiness={readiness}
          authState={snapshot.authState}
          processingConsent={Boolean(snapshot.processingConsentVersion)}
          backupNetwork={snapshot.backupNetwork}
          syncing={syncing}
          onBack={() => setRoute('home')}
          onAuth={() => openAuth('report-setup')}
          onConsent={() => { void setProcessingConsent('cloud-processing-v2').then(() => { trackAnalyticsEvent('processing_permission_accepted', { disclosureVersion: 2 }); return refreshFromCloud(); }).catch((error: unknown) => setNotice({ title: 'Processing permission was not enabled.', body: error instanceof Error ? error.message : 'Please reconnect and try again.' })); }}
          onSync={() => void syncNow().catch((error: unknown) => setNotice({
            title: 'Backup still needs attention.',
            body: error instanceof Error ? error.message : 'Please check your connection and try again.',
          }))}
          onUseCellular={() => { setBackupNetwork('wifi-and-cellular'); void refreshFromCloud().catch(() => undefined); }}
          onOpenReport={() => { setSelectedReportId(readiness.report?.id); setSelectedChapterId(snapshot.currentChapter.id); setRoute('report'); }}
          onPrivacy={() => openExternalSafely(process.env.EXPO_PUBLIC_PRIVACY_URL, 'Published privacy policy')}
          onShown={markReportSetupPromptShown}
        />
      );
      break;
    case 'purchase-success':
      screen = <PurchaseSuccessScreen plan={snapshot.purchaseSuccessPending?.plan ?? 'paid30'} onContinue={() => { trackAnalyticsEvent('night_8_opened', { plan: snapshot.purchaseSuccessPending?.plan ?? 'paid30' }); acknowledgePurchaseSuccess(); setRoute('home'); }} />;
      break;
    case 'paywall':
      screen = <PaywallScreen accessTier={snapshot.accessTier} authState={snapshot.authState} ownerId={snapshot.ownerId} nightsKept={recordedCount} source={isPurchaseIntentResumable(snapshot.purchaseIntent) ? snapshot.purchaseIntent!.source : snapshot.paywallSource ?? 'home_card'} intent={snapshot.purchaseIntent} verification={snapshot.purchaseVerification} restoreResult={snapshot.restoreResult} onBack={() => setRoute('home')} onAuth={() => openAuth('paywall')} onIntent={setPurchaseIntent} onVerification={setPurchaseVerification} onRefreshEntitlement={refreshEntitlement} onVerifying={verifyPurchase} onRestoreResult={setRestoreResult} onUnavailable={() => ownerSetup('Store products and RevenueCat')} onPrivacy={() => openExternalSafely(process.env.EXPO_PUBLIC_PRIVACY_URL, 'Published privacy policy')} onTerms={() => openExternalSafely(process.env.EXPO_PUBLIC_TERMS_URL, 'Published terms of use')} />;
      break;
    case 'auth':
      screen = <AuthScreen hasLocalRecordings={[snapshot.currentChapter, ...snapshot.completedChapters].some((chapter) => chapter.nights.some((night) => Boolean(night.recordedAt)))} onBack={() => { if (returnAfterAuth === 'paywall') { setPurchaseIntent(undefined); setRoute('home'); } else setRoute(returnAfterAuth); }} onAuthenticated={async (email, ownerId) => { await setAuthDetails(email, undefined, ownerId); await refreshFromCloud(); setRoute(returnAfterAuth); }} onUnavailable={(provider) => ownerSetup(provider)} />;
      break;
    case 'home':
    default:
      screen = <HomeScreen nights={snapshot.currentChapter.nights} recordedCount={recordedCount} currentNight={currentNight} targetLength={snapshot.currentChapter.targetLength} accessThrough={snapshot.currentChapter.accessThrough} accessTier={snapshot.accessTier} authState={snapshot.authState} syncing={syncing} processingConsent={Boolean(snapshot.processingConsentVersion)} demoMode={snapshot.demoMode} readiness={readiness} purchaseVerification={snapshot.purchaseVerification} newlyEarned={newlyEarned} reminderHour={snapshot.reminderHour} reminderMinute={snapshot.reminderMinute} onQuestion={() => setRoute('question')} onSettings={() => setRoute('settings')} onPaywall={() => openPaywall(snapshot.accessTier === 'trial' && Boolean(snapshot.currentChapter.completedAt) ? 'locked_night8' : 'home_card')} onReportSetup={() => setRoute('report-setup')} onReport={() => { setSelectedReportId(readiness.report?.id); setSelectedChapterId(snapshot.currentChapter.id); setRoute(readiness.report ? 'report' : 'generating'); }} />;
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
            <View style={styles.tabDockInner} pointerEvents="box-none">
              <TabBar active={route as TabKey} onChange={(key) => setRoute(key)} />
            </View>
          </View>
        </View>
      ) : screen}
      <BottomSheet
        visible={backupReminder}
        title="Your first reflection still needs setup."
        body={`${recordedCount} ${recordedCount === 1 ? 'night is' : 'nights are'} safe on this phone. A recoverable account, your processing permission, and secure backup prepare the private reflection at night 7.`}
        actions={[
          { label: 'Finish setup', onPress: () => { setBackupReminder(false); setRoute('report-setup'); } },
          { label: 'Later', variant: 'outline', onPress: () => setBackupReminder(false) },
        ]}
        onShown={markBackupPromptShown}
        onClose={() => setBackupReminder(false)}
      />
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
    alignItems: 'center',
  },
  tabDockInner: {
    width: '100%',
    maxWidth: 520,
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
