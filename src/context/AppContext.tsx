import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { reconcileSnapshot } from '@/domain/calendar';
import { isRecorded } from '@/domain/stats';
import { clearLocalState, initializeLocalState, saveLocalState, sealNightLocally } from '@/lib/localRepository';
import { defaultSnapshot, makeChapter } from '@/lib/snapshot';
import { clearLocalCloudSession, ensureAnonymousSession, requestRemoteDeletion, subscribeToAuthLinks } from '@/lib/supabase';
import { deleteAllRecordings } from '@/services/audioFiles';
import { synchronize } from '@/services/sync';
import type { AppSnapshot, Night } from '@/types';

type DemoMode = 'empty' | 'partial' | 'complete';

type AppContextValue = {
  snapshot: AppSnapshot;
  ready: boolean;
  syncing: boolean;
  currentNight: Night;
  recordedCount: number;
  updateReminder: (hour: number, minute: number) => void;
  finishOnboarding: (notificationsEnabled: boolean) => void;
  sealCurrentNight: (durationSec: number, localUri?: string) => Promise<boolean>;
  setAuthDetails: (email?: string, displayName?: string, ownerId?: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setGentleNudge: (enabled: boolean) => void;
  setBackupNetwork: (value: AppSnapshot['backupNetwork']) => void;
  setProcessingConsent: (version: string) => void;
  syncNow: () => Promise<void>;
  loadDemo: (mode: DemoMode) => void;
  resetEverything: (remote?: boolean) => Promise<void>;
};

const Context = createContext<AppContextValue | null>(null);

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
  const latest = useRef(snapshot);
  latest.current = snapshot;

  const runSync = useCallback(async () => {
    if (syncLock.current || !latest.current.onboarded) return;
    syncLock.current = true;
    setSyncing(true);
    try {
      const next = await synchronize(reconcileSnapshot(latest.current));
      latest.current = next;
      setSnapshot(next);
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      let stored = await initializeLocalState();
      try {
        const session = await ensureAnonymousSession();
        stored = {
          ...stored,
          ownerId: session.userId ?? stored.ownerId,
          email: session.email ?? stored.email,
          authState: session.state,
        };
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
      setSnapshot((current) => ({ ...current, ownerId, email, authState: 'authenticated' }));
      void runSync();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setSnapshot((current) => reconcileSnapshot(current));
        void runSync();
      }
    });
    return () => {
      active = false;
      removeLinkListener();
      appState.remove();
    };
  }, [runSync]);

  useEffect(() => {
    if (!ready) return;
    void saveLocalState(snapshot);
  }, [ready, snapshot]);

  useEffect(() => {
    if (ready && snapshot.onboarded) void runSync();
  }, [ready, snapshot.onboarded, snapshot.authState, snapshot.backupNetwork, runSync]);

  const update = useCallback((recipe: (current: AppSnapshot) => AppSnapshot) => {
    setSnapshot((current) => {
      const next = recipe(current);
      latest.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnightReconciliation = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      timer = setTimeout(() => {
        update((current) => reconcileSnapshot(current));
        void runSync();
        scheduleMidnightReconciliation();
      }, next.getTime() - now.getTime());
    };
    scheduleMidnightReconciliation();
    return () => clearTimeout(timer);
  }, [ready, runSync, update]);

  const sealCurrentNight = useCallback(async (durationSec: number, localUri?: string) => {
    const sealedIndex = nextCurrentNight(latest.current).index;
    const next = await sealNightLocally(latest.current, { durationSec, temporaryUri: localUri });
    latest.current = next;
    setSnapshot(next);
    void runSync();
    return [7, 30, 60, 90].includes(sealedIndex);
  }, [runSync]);

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
    update((current) => ({ ...current, onboarded: true, accessTier: 'paid30', currentChapter: chapter, demoMode: mode }));
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
    latest.current = next;
    setSnapshot(next);
  }, []);

  const recordedCount = snapshot.currentChapter.nights.filter(isRecorded).length;
  const currentNight = nextCurrentNight(snapshot);

  const value = useMemo<AppContextValue>(() => ({
    snapshot,
    ready,
    syncing,
    currentNight,
    recordedCount,
    updateReminder: (hour, minute) => update((current) => ({ ...current, reminderHour: hour, reminderMinute: minute })),
    finishOnboarding: (notificationsEnabled) => update((current) => ({ ...current, onboarded: true, notificationsEnabled })),
    sealCurrentNight,
    setAuthDetails: (email, displayName, ownerId) => update((current) => ({ ...current, authState: 'authenticated', email, displayName, ownerId: ownerId ?? current.ownerId })),
    setNotificationsEnabled: (notificationsEnabled) => update((current) => ({ ...current, notificationsEnabled })),
    setGentleNudge: (gentleNudge) => update((current) => ({ ...current, gentleNudge })),
    setBackupNetwork: (backupNetwork) => update((current) => ({ ...current, backupNetwork })),
    setProcessingConsent: (processingConsentVersion) => update((current) => ({ ...current, processingConsentVersion })),
    syncNow: runSync,
    loadDemo,
    resetEverything,
  }), [snapshot, ready, syncing, currentNight, recordedCount, update, sealCurrentNight, runSync, loadDemo, resetEverything]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('useApp must be used inside AppProvider.');
  return value;
}
