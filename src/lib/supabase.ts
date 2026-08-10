import 'react-native-url-polyfill/auto';

import { Linking } from 'react-native';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { createClient } from '@supabase/supabase-js';

import { appIdentifiers } from '@/config/environment';
import { mergeHydratedNight } from '@/domain/syncMerge';
import { secureStorage } from '@/lib/secureStorage';
import type { AppSnapshot, Chapter, Night, Report, ReportSection } from '@/types';

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

async function sessionHasAnonymousClaim(accessToken: string) {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getClaims(accessToken);
  if (error) throw error;
  return data?.claims?.is_anonymous === true;
}

// On web the provider returns into a popup that has to hand its result back to
// the opener and close itself. Without this the browser preview hangs on a
// blank tab after a successful Google sign-in. No-op on native.
WebBrowser.maybeCompleteAuthSession();

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
    await supabase.auth.signOut({ scope: 'local' });
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

/**
 * Converts the current anonymous identity into an email/password account
 * without changing its user id. Hosted Auth must have email confirmations
 * disabled: Supabase only allows a password to be attached after the email
 * identity is confirmed.
 */
export async function upgradeAnonymousWithEmailPassword(email: string, password: string) {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  await ensureAnonymousSession();
  const before = (await supabase.auth.getUser()).data.user;
  if (!before) throw new Error('The local cloud identity could not be restored.');
  if (!before.is_anonymous) throw new Error('This device is already linked to an account.');
  const { data: emailData, error: emailError } = await supabase.auth.updateUser({ email });
  if (emailError) throw emailError;
  if (!emailData.user || emailData.user.id !== before.id) {
    throw new Error('Account identity changed unexpectedly. Contact support before continuing.');
  }
  if (!emailData.user.email_confirmed_at) {
    throw new Error('Email confirmation is still enabled in Supabase. Disable Confirm email and try again.');
  }

  const { data: passwordData, error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) throw passwordError;
  if (!passwordData.user || passwordData.user.id !== before.id) {
    throw new Error('Account identity changed unexpectedly. Contact support before continuing.');
  }
  // RLS reads account state from the access-token claims, not from the fresh
  // `/user` response. Force a new JWT so Storage sees `is_anonymous: false`.
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw refreshError;
  if (!refreshed.session?.user || refreshed.session.user.is_anonymous) {
    throw new Error('The permanent account session could not be refreshed.');
  }
  return refreshed.session.user;
}

export async function permanentUploadIdentity() {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user || userData.user.is_anonymous) return null;

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
  return data.user;
}

export async function sendPasswordReset(email: string) {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUri });
  if (error) throw error;
}

export async function handleAuthCallback(url: string) {
  if (!supabase) return null;
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  if (!code) return null;
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data.session?.user ?? null;
}

/**
 * Raised when the provider itself has not been switched on in the Supabase
 * project, as opposed to the user cancelling or the network failing.
 *
 * Apple has `isAvailableAsync()` to lean on; Google has nothing equivalent, so
 * a project missing its Google credentials used to surface the raw string
 * "Unsupported provider: provider is not enabled" straight into the UI. That
 * reads as a broken app rather than an unfinished backend, and it is the single
 * most likely state for this project to be in before launch.
 */
export class ProviderUnavailableError extends Error {
  constructor(readonly provider: 'apple' | 'google') {
    super(`The ${provider} provider is not enabled for this project.`);
    this.name = 'ProviderUnavailableError';
  }
}

/** Supabase reports a disabled provider as a validation failure on the message
 *  rather than with a dedicated code, so the message is what we can match on. */
function assertProviderEnabled(provider: 'apple' | 'google', error: { message?: string; code?: string } | null) {
  if (!error) return;
  const message = (error.message ?? '').toLowerCase();
  if (message.includes('provider is not enabled') || message.includes('unsupported provider')) {
    throw new ProviderUnavailableError(provider);
  }
}

export async function linkOAuthIdentity(provider: 'apple' | 'google') {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const before = (await supabase.auth.getUser()).data.user;
  if (!before) throw new Error('The anonymous identity could not be restored.');
  const { data, error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo: authRedirectUri, skipBrowserRedirect: true } });
  assertProviderEnabled(provider, error);
  if (error) throw error;
  if (!data.url) throw new Error(`The ${provider} provider did not return an authorization URL.`);
  const result = await WebBrowser.openAuthSessionAsync(data.url, authRedirectUri);
  if (result.type !== 'success') return null;
  await handleAuthCallback(result.url);
  const after = (await supabase.auth.getUser()).data.user;
  if (!after || after.id !== before.id) throw new Error('Identity linking did not preserve the account. No data was moved.');
  return after;
}

/**
 * Hand Apple's single-use authorization code to the backend, which trades it
 * for a refresh token and keeps it until the account is deleted.
 *
 * Apple requires that deleting an account also revokes its tokens, and the code
 * expires within minutes of sign-in — so this is the only moment it can be
 * captured. It is intentionally non-fatal: nobody should be blocked from
 * signing in because a server-to-server exchange failed. What it costs is that
 * the account has no token to revoke later, which the launch checklist tracks.
 */
async function captureAppleAuthorizationCode(code: string | null) {
  if (!supabase || !code) return;
  try {
    await supabase.functions.invoke('apple-identity', { body: { code } });
  } catch {
    // Swallowed by design — see above.
  }
}

export async function linkNativeAppleIdentity() {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  if (!await AppleAuthentication.isAvailableAsync()) return linkOAuthIdentity('apple');
  const before = (await supabase.auth.getUser()).data.user;
  if (!before) throw new Error('The anonymous identity could not be restored.');
  const rawNonce = Crypto.randomUUID();
  const state = Crypto.randomUUID();
  const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce,
      state,
    });
    if (credential.state !== state || !credential.identityToken) throw new Error('Apple did not return a verifiable identity token.');
    const { error } = await supabase.auth.linkIdentity({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
    if (error) throw error;
    await captureAppleAuthorizationCode(credential.authorizationCode);
    const givenName = credential.fullName?.givenName;
    const familyName = credential.fullName?.familyName;
    if (givenName || familyName) {
      await supabase.auth.updateUser({ data: { full_name: [givenName, familyName].filter(Boolean).join(' '), given_name: givenName, family_name: familyName } });
    }
    const after = (await supabase.auth.getUser()).data.user;
    if (!after || after.id !== before.id) throw new Error('Apple linking did not preserve the account.');
    return after;
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw error;
  }
}

export async function signInNativeAppleIdentity() {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  if (!await AppleAuthentication.isAvailableAsync()) return signInWithOAuthProvider('apple');
  const rawNonce = Crypto.randomUUID();
  const state = Crypto.randomUUID();
  const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL], nonce, state,
    });
    if (credential.state !== state || !credential.identityToken) throw new Error('Apple did not return a verifiable identity token.');
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
    if (error) throw error;
    await captureAppleAuthorizationCode(credential.authorizationCode);
    const givenName = credential.fullName?.givenName;
    const familyName = credential.fullName?.familyName;
    if (givenName || familyName) await supabase.auth.updateUser({ data: { full_name: [givenName, familyName].filter(Boolean).join(' '), given_name: givenName, family_name: familyName } });
    return data.user;
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw error;
  }
}

export async function signInWithOAuthProvider(provider: 'apple' | 'google') {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: authRedirectUri, skipBrowserRedirect: true } });
  assertProviderEnabled(provider, error);
  if (error) throw error;
  if (!data.url) throw new Error(`The ${provider} provider did not return an authorization URL.`);
  const result = await WebBrowser.openAuthSessionAsync(data.url, authRedirectUri);
  if (result.type !== 'success') return null;
  return handleAuthCallback(result.url);
}

export function subscribeToAuthLinks(onUser: (userId: string, email?: string) => void) {
  const listener = Linking.addEventListener('url', ({ url }) => {
    void handleAuthCallback(url).then((user) => user && onUser(user.id, user.email)).catch(() => undefined);
  });
  return () => listener.remove();
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
  completed_at: string | null; nights: RemoteNight[]; reports: RemoteReport[];
};

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
  return {
    id: remote.id,
    length: remote.target_length,
    targetLength: remote.target_length,
    accessThrough: remote.access_through,
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

export async function hydrateFromSupabase(snapshot: AppSnapshot) {
  if (!supabase) return snapshot;
  const { data, error } = await supabase
    .from('chapters')
    .select('id,target_length,access_through,question_set,started_at,timezone,server_revision,purchase_status,completed_at,nights(*),reports(*)')
    .order('started_at', { ascending: false });
  if (error) throw error;
  const remote = (data ?? []) as unknown as RemoteChapter[];
  if (!remote.length) return snapshot;
  const activeRemote = remote.find((chapter) => !chapter.completed_at) ?? remote[0]!;
  const current = mergeRemoteChapter(activeRemote, snapshot.currentChapter);
  const completed = remote.filter((chapter) => chapter.id !== activeRemote.id).map(mapChapter);
  const reports = remote.flatMap((chapter) => (chapter.reports ?? []).map(mapReport));
  const accessTier = activeRemote.target_length === 90 ? 'paid90' as const : activeRemote.target_length === 30 ? 'paid30' as const : 'trial' as const;
  return { ...snapshot, accessTier, currentChapter: current, completedChapters: completed, reports };
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
  if (!supabase) return;
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}

export async function clearLocalCloudSession() {
  if (!supabase) return;
  await supabase.auth.signOut({ scope: 'local' });
}
