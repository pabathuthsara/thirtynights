import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { addLocalDays, reconcileSnapshot } from '@/domain/calendar';
import { isRecorded } from '@/domain/stats';
import { clearLocalState, initializeLocalState, rebindLocalCloudIdentity, saveLocalState, sealNightLocally } from '@/lib/localRepository';
import { defaultSnapshot, makeChapter } from '@/lib/snapshot';
import { clearLocalCloudSession, ensureAnonymousSession, requestRemoteDeletion, subscribeToAuthLinks } from '@/lib/supabase';
import { deleteAllRecordings } from '@/services/audioFiles';
import { synchronize } from '@/services/sync';
import type { AppSnapshot, IntentionId, Night, Report, ReportEvidence } from '@/types';

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
  setProcessingConsent: (version: string) => void;
  syncNow: () => Promise<void>;
  loadDemo: (mode: DemoMode) => void;
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
    if (ignoreOutboxBackoff) forceSyncQueued.current = true;
    if (syncLock.current) {
      // A seal or preference change that arrives during sync must get its own
      // pass. Dropping this request was what let the pre-seal result win.
      syncQueued.current = true;
      return;
    }
    syncLock.current = true;
    setSyncing(true);
    try {
      do {
        syncQueued.current = false;
        const forceThisPass = forceSyncQueued.current;
        forceSyncQueued.current = false;
        const startedFrom = latest.current;
        const startedAtRevision = localRevision.current;
        const next = await synchronize(reconcileSnapshot(startedFrom), { ignoreOutboxBackoff: forceThisPass });

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
    }
  }, []);

  const syncNow = useCallback(async () => {
    await runSync(true);
    const remaining = [latest.current.currentChapter, ...latest.current.completedChapters]
      .flatMap((chapter) => chapter.nights)
      .filter((night) => isRecorded(night) && !night.backedUp).length;
    if (remaining) {
      throw new Error(`${remaining} recording${remaining === 1 ? ' is' : 's are'} still waiting to back up.`);
    }
  }, [runSync]);

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
      }
    });
    return () => {
      active = false;
      removeLinkListener();
      appState.remove();
    };
  }, [adoptAuthDetails, runSync, update]);

  useEffect(() => {
    if (!ready) return;
    // Persistence happens after every meaningful state transition. Handle the
    // rejection here so a recoverable device-storage problem never becomes an
    // uncaught development overlay on top of the product UI.
    void saveLocalState(snapshot).catch(() => undefined);
  }, [ready, snapshot]);

  useEffect(() => {
    if (ready && snapshot.onboarded) void runSync().catch(() => undefined);
  }, [ready, snapshot.onboarded, snapshot.authState, snapshot.backupNetwork, runSync]);

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
    const sealedIndex = nextCurrentNight(latest.current).index;
    const next = await sealNightLocally(latest.current, { durationSec, temporaryUri: localUri });
    update(() => next);
    void runSync().catch(() => undefined);
    return [7, 30, 60, 90].includes(sealedIndex);
  }, [runSync, update]);

  const loadDemo = useCallback((mode: DemoMode) => {
    if (!__DEV__ || process.env.EXPO_PUBLIC_APP_ENV === 'production') return;
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

  const value = useMemo<AppContextValue>(() => ({
    snapshot,
    ready,
    syncing,
    currentNight,
    recordedCount,
    updateReminder: (hour, minute) => update((current) => ({ ...current, reminderHour: hour, reminderMinute: minute })),
    setIntentions: (intentions) => update((current) => ({ ...current, intentions })),
    finishOnboarding: (notificationsEnabled) => update((current) => ({ ...current, onboarded: true, notificationsEnabled })),
    sealCurrentNight,
    setAuthDetails: adoptAuthDetails,
    setNotificationsEnabled: (notificationsEnabled) => update((current) => ({ ...current, notificationsEnabled })),
    setGentleNudge: (gentleNudge) => update((current) => ({ ...current, gentleNudge })),
    setBackupNetwork: (backupNetwork) => update((current) => ({ ...current, backupNetwork })),
    setProcessingConsent: (processingConsentVersion) => update((current) => ({ ...current, processingConsentVersion })),
    // A user-requested sync should retry immediately even when a previous
    // transient failure scheduled exponential backoff.
    syncNow,
    loadDemo,
    advanceOneNight,
    resetEverything,
  }), [snapshot, ready, syncing, currentNight, recordedCount, update, sealCurrentNight, adoptAuthDetails, syncNow, loadDemo, advanceOneNight, resetEverything]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('useApp must be used inside AppProvider.');
  return value;
}
