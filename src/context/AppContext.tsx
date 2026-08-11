import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { addLocalDays, reconcileSnapshot } from '@/domain/calendar';
import { entitlementCovers } from '@/domain/conversion';
import { isRecorded } from '@/domain/stats';
import { clearLocalState, initializeLocalState, rebindLocalCloudIdentity, saveLocalState, sealNightLocally } from '@/lib/localRepository';
import { defaultSnapshot, makeChapter } from '@/lib/snapshot';
import { clearLocalCloudSession, ensureAnonymousSession, hydrateFromSupabase, requestRemoteDeletion, setRemoteProcessingConsent, subscribeToAuthLinks } from '@/lib/supabase';
import { deleteAllRecordings, deleteChapterRecordings } from '@/services/audioFiles';
import { clearCommerceIdentity, isAuthoritativePurchaseVerification } from '@/services/commerce';
import { synchronize, type SyncIssue } from '@/services/sync';
import { trackAnalyticsEvent } from '@/services/analytics';
import type {
  AccessTier,
  AppSnapshot,
  IntentionId,
  Night,
  PaywallSource,
  ProductPlan,
  PurchaseIntent,
  PurchaseVerification,
  Report,
  ReportEvidence,
  RestoreResult,
} from '@/types';

type DemoMode = 'empty' | 'partial' | 'complete';

type AppContextValue = {
  snapshot: AppSnapshot;
  ready: boolean;
  syncing: boolean;
  currentNight: Night;
  recordedCount: number;
  updateReminder: (hour: number, minute: number) => void;
  setIntentions: (intentions: IntentionId[]) => void;
  finishOnboarding: (notificationsEnabled: boolean) => void;
  sealCurrentNight: (durationSec: number, localUri?: string) => Promise<boolean>;
  setAuthDetails: (email?: string, displayName?: string, ownerId?: string) => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => void;
  setGentleNudge: (enabled: boolean) => void;
  setBackupNetwork: (value: AppSnapshot['backupNetwork']) => void;
  setProcessingConsent: (version?: string) => Promise<void>;
  syncNow: () => Promise<void>;
  refreshFromCloud: () => Promise<void>;
  refreshEntitlement: () => Promise<AccessTier | undefined>;
  verifyPurchase: (plan: ProductPlan) => Promise<'granted' | 'pending'>;
  markReportSetupPromptShown: () => void;
  markBackupPromptShown: () => void;
  setPaywallSource: (source: PaywallSource) => void;
  setPurchaseIntent: (intent?: PurchaseIntent) => void;
  setPurchaseVerification: (verification?: PurchaseVerification) => void;
  setRestoreResult: (result: RestoreResult) => void;
  acknowledgePurchaseSuccess: () => void;
  loadDemo: (mode: DemoMode) => void;
  exitDemo: (discardPreviewRecordings?: boolean) => Promise<boolean>;
  /** Development only: pulls the schedule back a day so the next night unlocks. */
  advanceOneNight: () => void;
  resetEverything: (remote?: boolean) => Promise<void>;
};

const Context = createContext<AppContextValue | null>(null);

/** A finished reflection for the `complete` developer preview. The quotes are
 *  obviously sample text, never claims about a real recording, and this only
 *  ever runs behind the `__DEV__` guard in `loadDemo`. */
function demoReport(chapter: AppSnapshot['currentChapter']): Report {
  const nightAt = (index: number) => chapter.nights[index - 1];
  const evidence = (index: number, startMs: number, quote: string): ReportEvidence[] => {
    const night = nightAt(index);
    if (!night) return [];
    return [{ nightId: night.id, nightIndex: night.index, segmentId: `demo-${index}`, startMs, endMs: startMs + 9_000, quote }];
  };

  return {
    id: `demo-report-${chapter.id}`,
    chapterId: chapter.id,
    checkpointNight: 30,
    status: 'ready',
    reportVersion: 'demo',
    generatedAt: new Date().toISOString(),
    summary: 'You spent the month telling yourself the truth in smaller and smaller sentences.',
    sections: [
      {
        title: 'You kept apologising for resting.',
        eyebrow: 'What kept returning',
        body: 'Eleven of these nights mention being tired, and eight of those follow the word "still" — still had to, still should have. The tiredness is not the pattern. The bargaining afterwards is.',
        evidence: evidence(4, 26_000, 'I got through it, which I suppose is the main thing.'),
      },
      {
        title: 'The evenings you liked were the unplanned ones.',
        eyebrow: 'What changed',
        body: 'Every night you describe as good arrived without being scheduled. The planned ones get reported; the unplanned ones get described.',
        evidence: evidence(19, 41_000, 'Nothing happened, really. It was just easy for once.'),
      },
    ],
  };
}

function nextCurrentNight(snapshot: AppSnapshot) {
  const nights = snapshot.currentChapter.nights;
  return nights.find((night) => night.status === 'today')
    ?? nights.find((night) => night.status === 'future' && night.index <= snapshot.currentChapter.accessThrough)
    ?? nights.at(-1)!;
}

export function AppProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(defaultSnapshot);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncLock = useRef(false);
  const syncQueued = useRef(false);
  const forceSyncQueued = useRef(false);
  const syncWaiters = useRef<Array<() => void>>([]);
  const lastSyncIssue = useRef<SyncIssue | undefined>(undefined);
  const demoReturnSnapshot = useRef<AppSnapshot | undefined>(undefined);
  const localRevision = useRef(0);
  const latest = useRef(snapshot);
  latest.current = snapshot;

  /** Commit a user/device mutation synchronously to the ref as well as React.
   *  The revision prevents an older in-flight sync from overwriting it. */
  const update = useCallback((recipe: (current: AppSnapshot) => AppSnapshot) => {
    const next = recipe(latest.current);
    latest.current = next;
    localRevision.current += 1;
    setSnapshot(next);
    return next;
  }, []);

  const runSync = useCallback(async (ignoreOutboxBackoff = false) => {
    if (!latest.current.onboarded) return;
    // Preview chapters use generated IDs and are intentionally detached from
    // the signed-in account. Persisting or uploading them would make test data
    // indistinguishable from someone's real journey.
    if (latest.current.demoMode) return;
    if (ignoreOutboxBackoff) forceSyncQueued.current = true;
    if (syncLock.current) {
      // A seal or preference change that arrives during sync must get its own
      // pass. Dropping this request was what let the pre-seal result win.
      syncQueued.current = true;
      await new Promise<void>((resolve) => syncWaiters.current.push(resolve));
      return;
    }
    syncLock.current = true;
    setSyncing(true);
    try {
      do {
        // A preview may be opened while a genuine cloud pass is in flight.
        // Stop before its queued retry; otherwise that retry would persist the
        // generated chapter despite the normal preview persistence guard.
        if (latest.current.demoMode) break;
        // Only the final serialized pass determines the status shown to a
        // person waiting on a manual sync. A queued retry may have resolved a
        // transient issue from the pass immediately before it.
        lastSyncIssue.current = undefined;
        syncQueued.current = false;
        const forceThisPass = forceSyncQueued.current;
        forceSyncQueued.current = false;
        const startedFrom = latest.current;
        const startedAtRevision = localRevision.current;
        const next = await synchronize(reconcileSnapshot(startedFrom), {
          ignoreOutboxBackoff: forceThisPass,
          onIssue: (issue) => {
            const priority: Record<SyncIssue['stage'], number> = { hydrate: 0, metadata: 1, audio: 2 };
            if (!lastSyncIssue.current || priority[issue.stage] > priority[lastSyncIssue.current.stage]) {
              lastSyncIssue.current = issue;
            }
          },
        });

        if (localRevision.current === startedAtRevision && latest.current === startedFrom) {
          // Persist only after proving this pass did not race a newer local
          // mutation. `synchronize` deliberately does not write snapshots.
          await saveLocalState(next);
          latest.current = next;
          setSnapshot(next);
        } else {
          // A local mutation landed while this pass was in flight. Discard the
          // stale result and immediately sync the newer durable snapshot.
          syncQueued.current = true;
        }
      } while (syncQueued.current && latest.current.onboarded);
    } finally {
      syncLock.current = false;
      setSyncing(false);
      syncWaiters.current.splice(0).forEach((resolve) => resolve());
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (latest.current.demoMode) {
      throw new Error('Developer previews are local-only. Return to your real journey before using cloud backup.');
    }
    lastSyncIssue.current = undefined;
    await runSync(true);
    // Audio is only one part of synchronization. A metadata or hydration
    // failure must not be reported as success merely because there is no raw
    // recording waiting at this instant.
    const issue = lastSyncIssue.current as SyncIssue | undefined;
    if (issue) throw new Error(issue.message);
    const pending = [latest.current.currentChapter, ...latest.current.completedChapters]
      .flatMap((chapter) => chapter.nights)
      .filter((night) => isRecorded(night) && !night.backedUp);
    if (pending.length) {
      if (latest.current.authState !== 'authenticated') {
        throw new Error('Connect a recoverable account before backing up. The recording remains safe on this phone.');
      }
      if (!latest.current.processingConsentVersion) {
        throw new Error('Reflection processing permission is required before anything can upload. The recording remains safe on this phone.');
      }
      throw new Error(latest.current.backupNetwork === 'wifi-only'
        ? `${pending.length} recording${pending.length === 1 ? ' is' : 's are'} waiting for Wi-Fi. Connect to Wi-Fi or allow cellular backup.`
        : `${pending.length} recording${pending.length === 1 ? ' is' : 's are'} waiting for a working connection. The ${pending.length === 1 ? 'recording remains' : 'recordings remain'} safe on this phone.`);
    }
  }, [runSync]);

  const refreshFromCloud = useCallback(async () => {
    await runSync(true);
  }, [runSync]);

  const refreshEntitlementOnly = useCallback(async () => {
    const startedFrom = latest.current;
    try {
      const next = await hydrateFromSupabase(reconcileSnapshot(startedFrom));
      // This path deliberately does not inspect or upload audio. If a local
      // mutation landed while the ledger request was in flight, discard the
      // stale result and let the next poll read the newer snapshot.
      if (latest.current === startedFrom) update(() => next);
      return next.accessTier;
    } catch {
      // A delayed/offline ledger becomes durable pending—not purchase failure.
      return undefined;
    }
  }, [update]);

  const finalizeVerifiedPurchase = useCallback((plan: ProductPlan) => {
    const pending = latest.current.purchaseVerification;
    if (!isAuthoritativePurchaseVerification(pending) || !entitlementCovers(latest.current.accessTier, plan)) return;
    const confirmedAt = Date.parse(pending.storeConfirmedAt ?? pending.updatedAt);
    trackAnalyticsEvent('checkout_server_granted', {
      plan,
      source: pending.source,
      grantLatencyMs: Number.isFinite(confirmedAt) ? Math.max(0, Date.now() - confirmedAt) : 0,
    });
    update((current) => {
      if (!entitlementCovers(current.accessTier, plan)) return current;
      return {
        ...current,
        purchaseIntent: undefined,
        purchaseVerification: undefined,
        unresolvedCheckpoint: current.unresolvedCheckpoint === 7 ? undefined : current.unresolvedCheckpoint,
        purchaseSuccessPending: current.purchaseSuccessPending ?? { plan, verifiedAt: new Date().toISOString() },
      };
    });
  }, [update]);

  const verifyPurchase = useCallback(async (plan: ProductPlan) => {
    update((current) => ({
      ...current,
      purchaseVerification: {
        plan,
        source: current.purchaseVerification?.source ?? current.purchaseIntent?.source ?? current.paywallSource ?? 'home_card',
        status: 'server-verifying',
        localizedPrice: current.purchaseVerification?.localizedPrice ?? current.purchaseIntent?.localizedPrice,
        transactionReference: current.purchaseVerification?.transactionReference,
        createdAt: current.purchaseVerification?.createdAt ?? new Date().toISOString(),
        storeConfirmedAt: current.purchaseVerification?.storeConfirmedAt,
        updatedAt: new Date().toISOString(),
      },
    }));

    // The store can return before the authoritative webhook grant reaches the
    // chapter ledger. Poll briefly, then leave a durable pending state rather
    // than turning latency into a false purchase failure.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await refreshEntitlementOnly();
      if (entitlementCovers(latest.current.accessTier, plan)) {
        finalizeVerifiedPurchase(plan);
        return 'granted' as const;
      }
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 1_500));
    }

    update((current) => ({
      ...current,
      purchaseIntent: undefined,
      purchaseVerification: current.purchaseVerification
        ? { ...current.purchaseVerification, status: 'pending-approval', updatedAt: new Date().toISOString() }
        : current.purchaseVerification,
    }));
    return 'pending' as const;
  }, [finalizeVerifiedPurchase, refreshEntitlementOnly, update]);

  const adoptAuthDetails = useCallback(async (email?: string, displayName?: string, ownerId?: string) => {
    const current = latest.current;
    const next = ownerId
      ? await rebindLocalCloudIdentity(current, ownerId, 'authenticated', email)
      : { ...current, authState: 'authenticated' as const, email };
    update(() => ({ ...next, displayName }));
  }, [update]);

  useEffect(() => {
    let active = true;
    (async () => {
      let stored = await initializeLocalState();
      try {
        const session = await ensureAnonymousSession();
        stored = session.userId
          ? await rebindLocalCloudIdentity(stored, session.userId, session.state, session.email)
          : { ...stored, email: session.email ?? stored.email, authState: session.state };
      } catch {
        // Local-first recording remains available when cloud identity is unavailable.
      }
      if (active) {
        latest.current = stored;
        setSnapshot(stored);
        setReady(true);
      }
    })();

    const removeLinkListener = subscribeToAuthLinks((ownerId, email) => {
      void adoptAuthDetails(email, undefined, ownerId)
        .then(() => runSync())
        .catch(() => undefined);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        update((current) => reconcileSnapshot(current));
        void runSync().catch(() => undefined);
        if (isAuthoritativePurchaseVerification(latest.current.purchaseVerification)) void refreshEntitlementOnly();
      }
    });
    return () => {
      active = false;
      removeLinkListener();
      appState.remove();
    };
  }, [adoptAuthDetails, refreshEntitlementOnly, runSync, update]);

  useEffect(() => {
    if (!ready || snapshot.demoMode) return;
    // Persistence happens after every meaningful state transition. Handle the
    // rejection here so a recoverable device-storage problem never becomes an
    // uncaught development overlay on top of the product UI.
    void saveLocalState(snapshot).catch(() => undefined);
  }, [ready, snapshot]);

  useEffect(() => {
    if (ready && snapshot.onboarded) void runSync().catch(() => undefined);
  }, [ready, snapshot.onboarded, snapshot.authState, snapshot.backupNetwork, snapshot.processingConsentVersion, runSync]);

  useEffect(() => {
    const pending = snapshot.purchaseVerification;
    if (isAuthoritativePurchaseVerification(pending) && entitlementCovers(snapshot.accessTier, pending.plan)) {
      finalizeVerifiedPurchase(pending.plan);
    }
  }, [finalizeVerifiedPurchase, snapshot.accessTier, snapshot.purchaseVerification]);

  useEffect(() => {
    if (!ready || !isAuthoritativePurchaseVerification(snapshot.purchaseVerification)) return;
    let active = true;
    let checking = false;
    const reconcilePurchase = async () => {
      if (!active || checking || AppState.currentState !== 'active') return;
      checking = true;
      try { await refreshEntitlementOnly(); } finally { checking = false; }
    };
    void reconcilePurchase();
    const timer = setInterval(() => { void reconcilePurchase(); }, 8_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [ready, refreshEntitlementOnly, snapshot.purchaseVerification?.plan, snapshot.purchaseVerification?.status]);

  useEffect(() => {
    if (!ready || !snapshot.reports.some((report) => report.status === 'queued' || report.status === 'running')) return;
    // Report generation happens in the local worker after upload. Refresh the
    // hydrated report while the app is open so Gallery changes from queued to
    // ready without making the user repeatedly press Synchronize.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void runSync().catch(() => undefined);
    }, 8_000);
    return () => clearInterval(timer);
  }, [ready, snapshot.reports, runSync]);

  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnightReconciliation = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      timer = setTimeout(() => {
        update((current) => reconcileSnapshot(current));
        void runSync().catch(() => undefined);
        scheduleMidnightReconciliation();
      }, next.getTime() - now.getTime());
    };
    scheduleMidnightReconciliation();
    return () => clearTimeout(timer);
  }, [ready, runSync, update]);

  const sealCurrentNight = useCallback(async (durationSec: number, localUri?: string) => {
    if (latest.current.demoMode) {
      throw new Error('Recording is disabled in Developer Preview. Return to your real journey to record a night.');
    }
    const sealedIndex = nextCurrentNight(latest.current).index;
    const next = await sealNightLocally(latest.current, { durationSec, temporaryUri: localUri });
    update(() => next);
    void runSync().catch(() => undefined);
    return [7, 30, 60, 90].includes(sealedIndex);
  }, [runSync, update]);

  const loadDemo = useCallback((mode: DemoMode) => {
    if (!__DEV__ || process.env.EXPO_PUBLIC_APP_ENV === 'production') return;
    if (!latest.current.demoMode) demoReturnSnapshot.current = latest.current;
    const chapter = makeChapter(30);
    const count = mode === 'empty' ? 0 : mode === 'partial' ? 12 : 30;
    const missed = new Set(mode === 'partial' ? [4, 9] : []);
    chapter.accessThrough = 30;
    chapter.nights = chapter.nights.map((night) => {
      if (missed.has(night.index)) return { ...night, status: 'missed' as const };
      if (night.index <= count) {
        const hour = [19, 20, 22, 23, 0, 1, 3, 4][night.index % 8] ?? 22;
        return {
          ...night,
          status: mode === 'complete' ? ('revealed' as const) : ('sealed' as const),
          recordedAt: new Date(Date.now() - (count - night.index) * 86_400_000).toISOString(),
          recordedHour: hour,
          durationSec: 48 + ((night.index * 17) % 112),
          backedUp: true,
          backupState: 'backed-up' as const,
        };
      }
      if (night.index === count + 1) return { ...night, status: 'today' as const };
      return { ...night, status: 'future' as const };
    });
    // A finished chapter also needs a finished reflection, otherwise the report
    // screen's real state — sections, quotes, the wax dots that play a night
    // back — is unreachable in a preview and can never be checked.
    const reports = mode === 'complete' ? [demoReport(chapter)] : [];

    update((current) => ({ ...current, onboarded: true, accessTier: 'paid30', currentChapter: chapter, reports, demoMode: mode }));
  }, [update]);

  const exitDemo = useCallback(async (discardPreviewRecordings = false) => {
    const preview = latest.current;
    if (!preview.demoMode) return preview.onboarded;
    const previewRecordingCount = preview.currentChapter.nights.filter((night) => Boolean(night.localUri)).length;
    if (previewRecordingCount && !discardPreviewRecordings) {
      throw new Error(`Export or explicitly remove the ${previewRecordingCount} preview recording${previewRecordingCount === 1 ? '' : 's'} before returning to your real journey.`);
    }

    let restored = demoReturnSnapshot.current;
    if (!restored) {
      if (preview.authState !== 'authenticated') {
        throw new Error('This older preview has no recoverable cloud journey. Export anything you need, then use Delete this device to start clean.');
      }
      // Older builds persisted previews. Rebuild a recording-free local shell
      // so hydration cannot merge a preview take into a real server night by
      // matching only its index.
      const blank = defaultSnapshot();
      const cloudShell: AppSnapshot = {
        ...blank,
        onboarded: true,
        onboardingVersion: preview.onboardingVersion,
        intentions: preview.intentions,
        reminderHour: preview.reminderHour,
        reminderMinute: preview.reminderMinute,
        timezone: preview.timezone,
        notificationsEnabled: preview.notificationsEnabled,
        notificationPreview: preview.notificationPreview,
        gentleNudge: preview.gentleNudge,
        authState: preview.authState,
        ownerId: preview.ownerId,
        displayName: preview.displayName,
        email: preview.email,
        backupNetwork: preview.backupNetwork,
        processingConsentVersion: preview.processingConsentVersion,
        processingConsentAcceptedAt: preview.processingConsentAcceptedAt,
        processingConsentWithdrawnAt: preview.processingConsentWithdrawnAt,
        appearance: preview.appearance,
      };
      const hydrated = await hydrateFromSupabase(cloudShell);
      if (hydrated.currentChapter.id === cloudShell.currentChapter.id) {
        throw new Error('Your real cloud journey could not be recovered yet. Check your connection and try again; the preview was left untouched.');
      }
      restored = reconcileSnapshot(hydrated);
    }

    if (previewRecordingCount && discardPreviewRecordings) deleteChapterRecordings(preview.currentChapter.id);
    demoReturnSnapshot.current = undefined;
    update(() => ({ ...restored!, demoMode: undefined }));
    return restored.onboarded;
  }, [update]);

  /**
   * Development only: pull the whole schedule back one day so the next night
   * falls on today and can be recorded immediately.
   *
   * A night is unlocked by `expectedLocalDate === today` (see
   * `reconcileChapter`), so there is no flag to flip — the dates themselves are
   * the gate. Moving them is also the honest simulation: it exercises the same
   * reconciliation a real overnight goes through, including the rule that an
   * unrecorded night whose date has passed becomes `missed` rather than being
   * silently carried forward. Seal tonight before advancing, or watch it lapse.
   */
  const advanceOneNight = useCallback(() => {
    if (!__DEV__ || process.env.EXPO_PUBLIC_APP_ENV === 'production') return;
    update((current) => reconcileSnapshot({
      ...current,
      currentChapter: {
        ...current.currentChapter,
        startedAt: new Date(Date.parse(current.currentChapter.startedAt) - 86_400_000).toISOString(),
        nights: current.currentChapter.nights.map((night) => ({
          ...night,
          expectedLocalDate: addLocalDays(night.expectedLocalDate, -1),
        })),
      },
    }));
  }, [update]);

  const resetEverything = useCallback(async (remote = false) => {
    // Identity detachment is part of deletion, not best-effort cleanup. Do it
    // before removing any local files so a failure leaves the person's device
    // data intact and recoverable rather than half-reset under an old owner.
    await clearCommerceIdentity();
    if (remote) await requestRemoteDeletion();
    else await clearLocalCloudSession();
    deleteAllRecordings();
    await clearLocalState();
    let next = defaultSnapshot();
    try {
      const session = await ensureAnonymousSession();
      next = { ...next, ownerId: session.userId ?? undefined, email: session.email, authState: session.state };
    } catch { /* A new local-only identity can be established later when the network returns. */ }
    update(() => next);
  }, [update]);

  const recordedCount = snapshot.currentChapter.nights.filter(isRecorded).length;
  const currentNight = nextCurrentNight(snapshot);

  const setProcessingConsent = useCallback(async (processingConsentVersion?: string) => {
    // The server transition is the privacy boundary. Never claim consent was
    // granted locally before the server can enforce it, and never claim a
    // withdrawal succeeded locally while a worker could still lease the job.
    await setRemoteProcessingConsent(processingConsentVersion);
    const changedAt = new Date().toISOString();
    update((current) => ({
      ...current,
      processingConsentVersion,
      processingConsentAcceptedAt: processingConsentVersion ? changedAt : current.processingConsentAcceptedAt,
      processingConsentWithdrawnAt: processingConsentVersion ? undefined : changedAt,
    }));
  }, [update]);

  const value = useMemo<AppContextValue>(() => ({
    snapshot,
    ready,
    syncing,
    currentNight,
    recordedCount,
    updateReminder: (hour, minute) => update((current) => ({ ...current, reminderHour: hour, reminderMinute: minute })),
    setIntentions: (intentions) => update((current) => ({ ...current, intentions })),
    finishOnboarding: (notificationsEnabled) => update((current) => ({ ...current, onboarded: true, onboardingVersion: 2, notificationsEnabled })),
    sealCurrentNight,
    setAuthDetails: adoptAuthDetails,
    setNotificationsEnabled: (notificationsEnabled) => update((current) => ({ ...current, notificationsEnabled })),
    setGentleNudge: (gentleNudge) => update((current) => ({ ...current, gentleNudge })),
    setBackupNetwork: (backupNetwork) => update((current) => ({ ...current, backupNetwork })),
    setProcessingConsent,
    // A user-requested sync should retry immediately even when a previous
    // transient failure scheduled exponential backoff.
    syncNow,
    refreshFromCloud,
    refreshEntitlement: refreshEntitlementOnly,
    verifyPurchase,
    markReportSetupPromptShown: () => update((current) => current.reportSetupPromptShownAt ? current : ({
      ...current,
      reportSetupPromptShownAt: new Date().toISOString(),
    })),
    markBackupPromptShown: () => update((current) => current.seenBackupPrompt ? current : ({
      ...current,
      seenBackupPrompt: true,
      backupPromptShownAt: new Date().toISOString(),
    })),
    setPaywallSource: (paywallSource) => update((current) => ({
      ...current,
      paywallSource,
      lastPurchaseInvitationAt: new Date().toISOString(),
    })),
    setPurchaseIntent: (purchaseIntent) => update((current) => ({ ...current, purchaseIntent })),
    setPurchaseVerification: (purchaseVerification) => update((current) => ({ ...current, purchaseVerification })),
    setRestoreResult: (restoreResult) => update((current) => ({ ...current, restoreResult })),
    acknowledgePurchaseSuccess: () => update((current) => ({ ...current, purchaseSuccessPending: undefined })),
    loadDemo,
    exitDemo,
    advanceOneNight,
    resetEverything,
  }), [snapshot, ready, syncing, currentNight, recordedCount, update, sealCurrentNight, adoptAuthDetails, setProcessingConsent, syncNow, refreshFromCloud, refreshEntitlementOnly, verifyPurchase, loadDemo, exitDemo, advanceOneNight, resetEverything]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('useApp must be used inside AppProvider.');
  return value;
}
