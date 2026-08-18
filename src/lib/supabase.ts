import 'react-native-url-polyfill/auto';

import { Linking } from 'react-native';
import { makeRedirectUri } from 'expo-auth-session';
import { createClient, type User } from '@supabase/supabase-js';

import { appIdentifiers } from '@/config/environment';
import { accessTierFromServer, targetForAccessTier } from '@/domain/entitlement';
import {
  isExpectedAuthCallback,
  isPasswordRecoveryCallback,
  normalizeRecoveryEmail,
  PASSWORD_RECOVERY_STORAGE_KEY,
  passwordRecoveryRedirectUri,
  passwordRecoveryUserMatches,
  type PasswordRecoveryStep,
  type PendingPasswordRecovery,
} from '@/lib/passwordRecovery';
import { mergeHydratedNight } from '@/domain/syncMerge';
import { secureStorage } from '@/lib/secureStorage';
import { processingConsentError } from '@/lib/supabaseErrors';
import type { AccessTier, AppSnapshot, Chapter, Night, Report, ReportSection } from '@/types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseKey && !supabaseKey.includes('replace_me') &&
  (supabaseKey.startsWith('sb_publishable_') || supabaseKey.startsWith('eyJ')),
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

export const authRedirectUri = makeRedirectUri({ scheme: appIdentifiers.scheme, path: 'auth/callback' });
const passwordResetRedirectUri = passwordRecoveryRedirectUri(authRedirectUri);
const LEGACY_EMAIL_UPGRADE_STORAGE_KEY = 'email-upgrade.v1';

export type PasswordRecoveryState = { email: string; step: PasswordRecoveryStep };
type PasswordRecoveryListener = (state: PasswordRecoveryState | null, error?: Error) => void;
const passwordRecoveryListeners = new Set<PasswordRecoveryListener>();

function publishPasswordRecovery(state: PasswordRecoveryState | null, error?: Error) {
  for (const listener of passwordRecoveryListeners) listener(state, error);
}

async function clearLegacyEmailUpgrade() {
  await secureStorage.removeItem(LEGACY_EMAIL_UPGRADE_STORAGE_KEY);
}

async function readPendingPasswordRecovery(): Promise<PendingPasswordRecovery | null> {
  const stored = await secureStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY);
  if (!stored) return null;
  try {
    const candidate = JSON.parse(stored) as Partial<PendingPasswordRecovery>;
    const requestedAt = typeof candidate.requestedAt === 'string' ? Date.parse(candidate.requestedAt) : NaN;
    if (
      candidate.version !== 1
      || typeof candidate.email !== 'string'
      || normalizeRecoveryEmail(candidate.email) !== candidate.email
      || (candidate.step !== 'email-sent' && candidate.step !== 'set-password')
      || !Number.isFinite(requestedAt)
      || requestedAt > Date.now() + 5 * 60_000
      || Date.now() - requestedAt > 24 * 60 * 60_000
    ) throw new Error('Invalid pending password recovery.');
    return candidate as PendingPasswordRecovery;
  } catch {
    await clearPendingPasswordRecovery();
    return null;
  }
}

async function writePendingPasswordRecovery(pending: PendingPasswordRecovery) {
  await secureStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, JSON.stringify(pending));
}

async function clearPendingPasswordRecovery() {
  await secureStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
}

async function pendingPasswordRecoveryForUser(user: User) {
  const pending = await readPendingPasswordRecovery();
  return pending && passwordRecoveryUserMatches(pending, user) ? pending : null;
}

/** `signOut()` reports failures in its return value. Verify the local cache as
 * well so a device-only reset can never erase recordings while an old account
 * session is still capable of synchronizing the replacement snapshot. */
async function clearLocalSessionVerified() {
  if (!supabase) return;
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (data.session) {
    throw signOutError ?? new Error('The previous cloud session is still active on this device.');
  }
  // Some providers can return an endpoint error after already deleting their
  // local token. A verified empty cache is the safety condition we need.
}

async function sessionHasAnonymousClaim(accessToken: string) {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getClaims(accessToken);
  if (error) throw error;
  return data?.claims?.is_anonymous === true;
}

export async function ensureAnonymousSession() {
  if (!supabase) return { userId: null, state: 'local' as const };
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session?.user) {
    // getSession() only reads the cached JWT. A user deleted from the Auth
    // dashboard can therefore look signed in forever on the device even though
    // every authenticated request fails. Validate it with the Auth server
    // before trusting the cached identity.
    const { data: verified, error: verificationError } = await supabase.auth.getUser();
    if (verified.user) {
      // A password-recovery link creates a valid session before the user has
      // chosen the replacement password. Keep application state and syncing
      // fail-closed until that final step succeeds.
      const pendingRecovery = await pendingPasswordRecoveryForUser(verified.user);
      if (pendingRecovery) {
        return {
          userId: verified.user.id,
          email: pendingRecovery.email,
          state: 'anonymous' as const,
        };
      }
      // Converting an anonymous identity to email/password changes the server
      // user immediately, but an already-issued JWT can retain
      // `is_anonymous: true`. Refresh it before Storage evaluates policies.
      if (!verified.user.is_anonymous && await sessionHasAnonymousClaim(sessionData.session.access_token)) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) throw refreshError;
        if (!refreshed.session?.user) throw new Error('The permanent account session could not be refreshed.');
        return {
          userId: refreshed.session.user.id,
          email: refreshed.session.user.email,
          state: refreshed.session.user.is_anonymous ? ('anonymous' as const) : ('authenticated' as const),
        };
      }
      return {
        userId: verified.user.id,
        email: verified.user.email,
        state: verified.user.is_anonymous ? ('anonymous' as const) : ('authenticated' as const),
      };
    }
    const status = (verificationError as { status?: number } | null)?.status;
    if (verificationError && status !== 401 && status !== 403) throw verificationError;
    await clearLocalSessionVerified();
    await clearLegacyEmailUpgrade();
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error('Supabase did not create a cloud identity.');
  return {
    userId: data.user.id,
    email: data.user.email,
    state: data.user.is_anonymous ? ('anonymous' as const) : ('authenticated' as const),
  };
}

/** Converts the device's anonymous owner into an email/password account in one
 * request. Supabase email confirmation must remain disabled so the same UUID
 * becomes permanent immediately without an email-link round trip. */
export async function linkEmailPassword(email: string, password: string) {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  await ensureAnonymousSession();
  await clearLegacyEmailUpgrade();
  const { data: beforeData, error: beforeError } = await supabase.auth.getUser();
  if (beforeError) throw beforeError;
  const before = beforeData.user;
  if (!before) throw new Error('The local cloud identity could not be restored.');
  if (!before.is_anonymous) throw new Error('This device is already linked to an account.');
  const normalizedEmail = normalizeRecoveryEmail(email);
  const { data, error } = await supabase.auth.updateUser({ email: normalizedEmail, password });
  if (error) throw error;
  if (!data.user || data.user.id !== before.id) {
    throw new Error('Account identity changed unexpectedly. Contact support before continuing.');
  }
  if (
    data.user.is_anonymous
    || !data.user.email_confirmed_at
    || normalizeRecoveryEmail(data.user.email ?? '') !== normalizedEmail
  ) {
    throw new Error('Immediate email/password accounts are not enabled in Supabase. Disable email confirmation and try again.');
  }
  // RLS reads identity state from access-token claims. Refresh after the
  // anonymous-to-permanent conversion before Storage evaluates its policies.
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw refreshError;
  const user = refreshed.session?.user;
  if (
    !user
    || user.id !== before.id
    || user.is_anonymous
    || normalizeRecoveryEmail(user.email ?? '') !== normalizedEmail
  ) {
    throw new Error('The permanent account session could not be refreshed.');
  }
  await clearPendingPasswordRecovery();
  return user;
}

export async function permanentUploadIdentity() {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user || userData.user.is_anonymous) return null;
  if (await pendingPasswordRecoveryForUser(userData.user)) return null;

  let { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return null;

  if (await sessionHasAnonymousClaim(sessionData.session.access_token)) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    sessionData = refreshed.data;
  }
  if (!sessionData.session || await sessionHasAnonymousClaim(sessionData.session.access_token)) return null;
  return { user: userData.user, session: sessionData.session };
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) {
    await clearLegacyEmailUpgrade();
    await clearPendingPasswordRecovery();
  }
  return data.user;
}

export async function sendPasswordReset(email: string): Promise<PasswordRecoveryState> {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const pending: PendingPasswordRecovery = {
    version: 1,
    email: normalizeRecoveryEmail(email),
    requestedAt: new Date().toISOString(),
    step: 'email-sent',
  };
  // Store only the normalized email and recovery phase. The PKCE verifier is
  // managed separately by Supabase in the same device-bound secure storage.
  await writePendingPasswordRecovery(pending);
  const { error } = await supabase.auth.resetPasswordForEmail(pending.email, {
    redirectTo: passwordResetRedirectUri,
  });
  if (error) {
    await clearPendingPasswordRecovery();
    throw error;
  }
  const state = { email: pending.email, step: pending.step };
  publishPasswordRecovery(state);
  return state;
}

export async function getPasswordRecoveryState(): Promise<PasswordRecoveryState | null> {
  if (!supabase) return null;
  const pending = await readPendingPasswordRecovery();
  if (!pending) return null;
  if (pending.step === 'email-sent') return { email: pending.email, step: pending.step };
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user || !passwordRecoveryUserMatches(pending, data.user)) {
    await clearPendingPasswordRecovery();
    return null;
  }
  return { email: pending.email, step: pending.step };
}

export function subscribeToPasswordRecovery(listener: PasswordRecoveryListener) {
  passwordRecoveryListeners.add(listener);
  return () => passwordRecoveryListeners.delete(listener);
}

export async function cancelPasswordRecovery() {
  const pending = await readPendingPasswordRecovery();
  if (pending?.step === 'set-password') await clearLocalSessionVerified();
  await clearPendingPasswordRecovery();
  publishPasswordRecovery(null);
}

export async function completePasswordRecovery(password: string) {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const pending = await readPendingPasswordRecovery();
  if (!pending || pending.step !== 'set-password') {
    throw new Error('Open the newest password-reset link before choosing a new password.');
  }
  const { data: beforeData, error: beforeError } = await supabase.auth.getUser();
  if (beforeError) throw beforeError;
  if (!beforeData.user || !passwordRecoveryUserMatches(pending, beforeData.user)) {
    await clearPendingPasswordRecovery();
    throw new Error('The password-reset session does not match this request. Start again.');
  }
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  if (!data.user || normalizeRecoveryEmail(data.user.email ?? '') !== pending.email) {
    throw new Error('The recovered account changed unexpectedly. Contact support before continuing.');
  }
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw refreshError;
  if (!refreshed.session?.user || normalizeRecoveryEmail(refreshed.session.user.email ?? '') !== pending.email) {
    throw new Error('The recovered account session could not be refreshed.');
  }
  await clearPendingPasswordRecovery();
  publishPasswordRecovery(null);
  return refreshed.session.user;
}

async function exchangeAuthCallback(url: string): Promise<User | null> {
  if (!supabase) return null;
  const parsed = new URL(url);
  if (!isExpectedAuthCallback(parsed, authRedirectUri)) return null;
  const passwordRecoveryCallback = isPasswordRecoveryCallback(parsed);
  const pendingRecoveryRequest = passwordRecoveryCallback ? await readPendingPasswordRecovery() : null;
  if (passwordRecoveryCallback && !pendingRecoveryRequest) {
    throw new Error('This password-reset request is no longer active. Start again.');
  }
  const callbackError = parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error');
  if (callbackError) throw new Error(callbackError.replace(/\+/g, ' '));
  const code = parsed.searchParams.get('code');
  if (!code) return null;
  const flowId = parsed.searchParams.get('sb_flow_id');
  let recoveryEvent = false;
  const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') recoveryEvent = true;
  });
  const { data, error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  ).finally(() => authListener.subscription.unsubscribe());
  if (error) throw error;
  const user = data.session?.user ?? null;
  if (!user) return null;
  if (recoveryEvent) {
    const pending = pendingRecoveryRequest;
    if (!passwordRecoveryCallback || !pending || normalizeRecoveryEmail(user.email ?? '') !== pending.email) {
      await clearLocalSessionVerified();
      await clearPendingPasswordRecovery();
      throw new Error('The password-reset link does not match the request from this device. Start again.');
    }
    const ready: PendingPasswordRecovery = { ...pending, step: 'set-password' };
    if (!passwordRecoveryUserMatches(ready, user)) {
      await clearLocalSessionVerified();
      await clearPendingPasswordRecovery();
      throw new Error('The password-reset link did not verify the expected account. Start again.');
    }
    await writePendingPasswordRecovery(ready);
    publishPasswordRecovery({ email: ready.email, step: ready.step });
    // Do not let AppContext adopt the authenticated recovery session until the
    // replacement password has actually been set.
    return null;
  }
  if (passwordRecoveryCallback) {
    await clearLocalSessionVerified();
    await clearPendingPasswordRecovery();
    throw new Error('The link was not a valid password-recovery link. Request a new one.');
  }
  return user;
}

const authCallbackPromises = new Map<string, Promise<User | null>>();

export function handleAuthCallback(url: string): Promise<User | null> {
  const existing = authCallbackPromises.get(url);
  if (existing) return existing;
  const callback = exchangeAuthCallback(url);
  authCallbackPromises.set(url, callback);
  // Bound the in-memory replay guard without re-enabling a just-consumed code.
  if (authCallbackPromises.size > 12) {
    const oldest = authCallbackPromises.keys().next().value as string | undefined;
    if (oldest) authCallbackPromises.delete(oldest);
  }
  return callback;
}

export function subscribeToAuthLinks(onUser: (userId: string, email?: string) => void) {
  let active = true;
  const receive = (url: string) => {
    let passwordRecovery = false;
    try {
      const parsed = new URL(url);
      if (!isExpectedAuthCallback(parsed, authRedirectUri)) return;
      passwordRecovery = isPasswordRecoveryCallback(parsed);
    } catch { return; }
    void handleAuthCallback(url)
      .then((user) => { if (active && user) onUser(user.id, user.email); })
      .catch((caught: unknown) => {
        if (!active) return;
        const error = caught instanceof Error ? caught : new Error('The account link could not be completed.');
        if (passwordRecovery) publishPasswordRecovery(null, error);
      });
  };
  const listener = Linking.addEventListener('url', ({ url }) => receive(url));
  // A mail link can launch a terminated app, in which case no future `url`
  // event is guaranteed. Register the listener first, then process the initial
  // URL; the callback replay guard makes a delivery race harmless.
  void Linking.getInitialURL().then((url) => { if (active && url) receive(url); }).catch(() => undefined);
  return () => {
    active = false;
    listener.remove();
  };
}

type RemoteNight = {
  id: string; client_id: string | null; index: number; expected_local_date: string; timezone: string; question_id: string;
  question_version: string; state: Night['status']; recorded_at: string | null; recorded_hour: number | null;
  duration_sec: number | null; storage_path: string | null; checksum: string | null; byte_size: number | null;
  revealed_at: string | null; visual_seed: number;
};

type RemoteReport = {
  id: string; chapter_id: string; checkpoint_night: Report['checkpointNight']; status: Report['status'];
  sections: unknown; summary: string | null; audio_path: string | null; generated_at: string | null;
  error_code: string | null; trace_id: string | null; report_version: string;
};

type RemoteChapter = {
  id: string; target_length: Chapter['targetLength']; access_through: number; question_set: Chapter['questionSet'];
  started_at: string; timezone: string; server_revision: number; purchase_status: Chapter['purchaseStatus'];
  plan_state: AccessTier; completed_at: string | null; nights: RemoteNight[]; reports: RemoteReport[];
};

type RemoteProcessingConsent = {
  processing_consent_version: string | null;
  processing_consent_granted_at: string | null;
  processing_consent_withdrawn_at: string | null;
};

/**
 * `target_length` is deliberately a historical schedule high-water mark. A
 * refunded 90-night purchase can therefore leave it at 90. Only the ledger
 * projection (`plan_state` + `purchase_status`) is allowed to unlock access.
 */
function mapNight(remote: RemoteNight): Night {
  return {
    id: remote.client_id ?? remote.id,
    index: remote.index,
    expectedLocalDate: remote.expected_local_date,
    timezone: remote.timezone,
    questionId: remote.question_id,
    questionVersion: remote.question_version,
    status: remote.state,
    recordedAt: remote.recorded_at ?? undefined,
    recordedHour: remote.recorded_hour ?? undefined,
    durationSec: remote.duration_sec ?? undefined,
    storagePath: remote.storage_path ?? undefined,
    checksum: remote.checksum ?? undefined,
    byteSize: remote.byte_size ?? undefined,
    backedUp: Boolean(remote.storage_path),
    backupState: remote.storage_path ? 'backed-up' : remote.recorded_at ? 'waiting-account' : 'on-device',
    revealAt: remote.revealed_at ?? undefined,
    visualSeed: remote.visual_seed,
  };
}

function mapReport(remote: RemoteReport): Report {
  const sections = Array.isArray(remote.sections) ? remote.sections as ReportSection[] : [];
  return {
    id: remote.id,
    chapterId: remote.chapter_id,
    checkpointNight: remote.checkpoint_night,
    status: remote.status,
    sections,
    summary: remote.summary ?? undefined,
    audioPath: remote.audio_path ?? undefined,
    generatedAt: remote.generated_at ?? undefined,
    errorCode: remote.error_code ?? undefined,
    traceId: remote.trace_id ?? undefined,
    reportVersion: remote.report_version,
  };
}

function mapChapter(remote: RemoteChapter): Chapter {
  const targetLength = targetForAccessTier(accessTierFromServer(remote.plan_state, remote.purchase_status));
  return {
    id: remote.id,
    length: targetLength,
    targetLength,
    // Fail closed if a pre-migration or partially applied server still exposes
    // a historical access value that exceeds its current ledger projection.
    accessThrough: Math.min(remote.access_through, targetLength),
    questionSet: remote.question_set,
    startedAt: remote.started_at,
    timezone: remote.timezone,
    serverRevision: remote.server_revision,
    purchaseStatus: remote.purchase_status,
    completedAt: remote.completed_at ?? undefined,
    nights: [...(remote.nights ?? [])].sort((a, b) => a.index - b.index).map(mapNight),
  };
}

function mergeRemoteChapter(remote: RemoteChapter, local?: Chapter): Chapter {
  const mapped = mapChapter(remote);
  if (!local) return mapped;
  return {
    ...mapped,
    nights: mapped.nights.map((night) => {
      const localNight = local.nights.find((candidate) => candidate.id === night.id || candidate.index === night.index);
      return mergeHydratedNight(night, localNight);
    }),
  };
}

function localChapterForRemote(remote: RemoteChapter, localChapters: Chapter[]) {
  const direct = localChapters.find((chapter) => chapter.id === remote.id);
  if (direct) return direct;
  const remoteClientIds = new Set(
    (remote.nights ?? []).flatMap((night) => night.client_id ? [night.client_id] : []),
  );
  const byClientNight = localChapters.find((chapter) => (
    chapter.nights.some((night) => remoteClientIds.has(night.id))
  ));
  if (byClientNight) return byClientNight;

  // Before the first seal, the client and server chapter UUIDs are expected to
  // differ: Auth creates the server chapter, while the offline shell already
  // created its local schedule. initialize_chapter_schedule aligns their civil
  // dates/timezone, which is the safe identity for that recording-free case.
  const firstRemote = remote.nights?.[0];
  return localChapters.find((chapter) => {
    const firstLocal = chapter.nights[0];
    return firstRemote
      && firstLocal
      && firstRemote.expected_local_date === firstLocal.expectedLocalDate
      && remote.timezone === chapter.timezone;
  });
}

function isMissingProcessingConsentContract(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? '';
  return (error.code === '42703' || error.code === 'PGRST204')
    && message.includes('processing_consent');
}

export async function hydrateFromSupabase(snapshot: AppSnapshot): Promise<AppSnapshot> {
  if (!supabase) return snapshot;
  const [chaptersResult, consentResult] = await Promise.all([
    supabase
      .from('chapters')
      .select('id,target_length,access_through,question_set,started_at,timezone,server_revision,plan_state,purchase_status,completed_at,nights(*),reports(*)')
      .order('started_at', { ascending: false }),
    supabase
      .from('users')
      .select('processing_consent_version,processing_consent_granted_at,processing_consent_withdrawn_at')
      .maybeSingle(),
  ]);
  if (chaptersResult.error) throw chaptersResult.error;
  // The client and consent-enforcing worker are promoted together with the
  // forward migration. During that bounded rollout window, preserve the
  // previously accepted local disclosure rather than breaking all chapter
  // hydration merely because the old server does not expose these columns yet.
  // Every other consent-query error still fails closed, and grant/withdraw
  // mutations never fall back to local-only state.
  const preConsentContract = consentResult.error
    && isMissingProcessingConsentContract(consentResult.error);
  if (consentResult.error && !preConsentContract) throw consentResult.error;
  const data = chaptersResult.data;
  const remote = (data ?? []) as unknown as RemoteChapter[];
  const consent = consentResult.data as RemoteProcessingConsent | null;
  const consentState = preConsentContract
    ? {
        processingConsentVersion: snapshot.processingConsentVersion,
        processingConsentAcceptedAt: snapshot.processingConsentAcceptedAt,
        processingConsentWithdrawnAt: snapshot.processingConsentWithdrawnAt,
      }
    : {
        processingConsentVersion: consent?.processing_consent_version ?? undefined,
        processingConsentAcceptedAt: consent?.processing_consent_granted_at ?? undefined,
        processingConsentWithdrawnAt: consent?.processing_consent_withdrawn_at ?? undefined,
      };
  if (!remote.length) {
    // An authenticated response with no owned chapter contains no evidence of
    // a paid grant. Keep device recordings, but fail closed on cloud access.
    return {
      ...snapshot,
      ...consentState,
      accessTier: 'trial',
      currentChapter: {
        ...snapshot.currentChapter,
        length: 7,
        targetLength: 7,
        accessThrough: Math.min(snapshot.currentChapter.accessThrough, 7),
        purchaseStatus: 'none',
      },
    };
  }
  const activeRemote = remote.find((chapter) => !chapter.completed_at) ?? remote[0]!;
  const localChapters = [snapshot.currentChapter, ...snapshot.completedChapters];
  // Match by chapter identity before preserving a device URI. Matching a newly
  // opened cloud chapter to the previous local chapter by night index could
  // otherwise attach Night 1's file to a different journey. Completed
  // chapters use the same merge so hydration never drops an older take that is
  // still available only on this device.
  const current = mergeRemoteChapter(
    activeRemote,
    localChapterForRemote(activeRemote, localChapters),
  );
  const completed = remote
    .filter((chapter) => chapter.id !== activeRemote.id)
    .map((chapter) => mergeRemoteChapter(
      chapter,
      localChapterForRemote(chapter, localChapters),
    ));
  const reports = remote.flatMap((chapter) => (chapter.reports ?? []).map(mapReport));
  const accessTier = accessTierFromServer(activeRemote.plan_state, activeRemote.purchase_status);
  return {
    ...snapshot,
    accessTier,
    ...consentState,
    currentChapter: current,
    completedChapters: completed,
    reports,
  };
}

export async function setRemoteProcessingConsent(version?: string) {
  if (!supabase) throw new Error('Cloud processing consent is not configured.');
  const { data, error } = await supabase.rpc('set_processing_consent', {
    requested_version: version ?? null,
  });
  if (error) throw processingConsentError(error);
  return data as { processing_consent_version: string | null; active: boolean };
}

export async function initializeRemoteSchedule(timezone: string, startDate: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc('initialize_chapter_schedule', { timezone_name: timezone, local_start_date: startDate });
  if (error) throw error;
}

export async function reconcileRemoteChapter() {
  if (!supabase) return;
  const { error } = await supabase.rpc('reconcile_chapter_state');
  if (error) throw error;
}

export async function syncSealedNight(operationId: string, payload: Record<string, unknown>) {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const { data, error } = await supabase.rpc('sync_sealed_night', { operation_id: operationId, seal: payload });
  if (error) throw error;
  return data as { chapter_id: string; night_id: string };
}

export async function attachNightAudio(nightId: string, storagePath: string, checksum: string, byteSize: number) {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const { error } = await supabase.rpc('attach_night_audio', {
    night_id: nightId, storage_path: storagePath, expected_checksum: checksum, expected_byte_size: byteSize,
  });
  if (error) throw error;
}

export async function signedRecordingUrl(path: string) {
  if (!supabase) throw new Error('Cloud playback is not configured.');
  const { data, error } = await supabase.storage.from('recordings').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function signedReportAudioUrl(path: string) {
  if (!supabase) throw new Error('Cloud report playback is not configured.');
  const { data, error } = await supabase.storage.from('report-audio').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function retryReport(reportId: string) {
  if (!supabase) throw new Error('Cloud report processing is not configured.');
  const { error } = await supabase.rpc('retry_report', { report_id: reportId });
  if (error) throw error;
}

export async function requestRemoteDeletion() {
  if (!supabase) {
    throw new Error('Cloud account deletion is unavailable in this build. Nothing on this device was removed.');
  }
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
  if (error) {
    const context = typeof error === 'object' && error && 'context' in error
      ? (error as { context?: unknown }).context
      : undefined;
    const status = context instanceof Response ? context.status : undefined;
    let code: string | undefined;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown };
        code = typeof payload.error === 'string' ? payload.error : undefined;
      } catch { /* A plain-text provider response is mapped by status below. */ }
    }

    if (status === 401) {
      throw new Error('Your cloud session expired. Reconnect your account and try again; this device was left untouched.');
    }
    if (status === 404) {
      throw new Error('Secure cloud deletion is temporarily unavailable. This device was left untouched; please contact support.');
    }
    if (status === 503 || code === 'revenuecat_delete_not_configured') {
      throw new Error('Cloud deletion is temporarily unavailable while purchase cleanup is being configured. This device was left untouched; please contact support.');
    }
    throw new Error('Cloud deletion was not confirmed, so this device was left untouched. Please retry or contact support.');
  }
  // The server account is already irreversibly gone at this point. Make a
  // best-effort local detach, then allow the requested device wipe to finish;
  // any cached token is invalid because its Auth owner no longer exists.
  await clearLocalSessionVerified().catch(() => undefined);
  await clearLegacyEmailUpgrade();
  await clearPendingPasswordRecovery();
}

export async function clearLocalCloudSession() {
  try {
    await clearLocalSessionVerified();
  } catch {
    throw new Error('This device could not disconnect from the cloud account, so its recordings were left untouched. Check your connection and try again.');
  }
  await clearLegacyEmailUpgrade();
  await clearPendingPasswordRecovery();
}
