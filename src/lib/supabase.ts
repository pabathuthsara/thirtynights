import 'react-native-url-polyfill/auto';

import { Linking } from 'react-native';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { createClient, type User } from '@supabase/supabase-js';

import { appIdentifiers } from '@/config/environment';
import { accessTierFromServer, targetForAccessTier } from '@/domain/entitlement';
import {
  EMAIL_UPGRADE_STORAGE_KEY,
  emailUpgradeRedirectUri,
  emailUpgradeState as resolveEmailUpgradeState,
  isEmailUpgradeCallback,
  isExpectedAuthCallback,
  normalizeUpgradeEmail,
  type EmailUpgradeState,
  type PendingEmailUpgrade,
} from '@/lib/emailUpgrade';
import { mergeHydratedNight } from '@/domain/syncMerge';
import { secureStorage } from '@/lib/secureStorage';
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
const anonymousEmailRedirectUri = emailUpgradeRedirectUri(authRedirectUri);

type EmailUpgradeListener = (state: EmailUpgradeState | null, error?: Error) => void;
const emailUpgradeListeners = new Set<EmailUpgradeListener>();

function publishEmailUpgrade(state: EmailUpgradeState | null, error?: Error) {
  for (const listener of emailUpgradeListeners) listener(state, error);
}

async function readPendingEmailUpgrade(): Promise<PendingEmailUpgrade | null> {
  const stored = await secureStorage.getItem(EMAIL_UPGRADE_STORAGE_KEY);
  if (!stored) return null;
  try {
    const candidate = JSON.parse(stored) as Partial<PendingEmailUpgrade>;
    if (
      candidate.version !== 1
      || typeof candidate.userId !== 'string'
      || typeof candidate.email !== 'string'
      || typeof candidate.requestedAt !== 'string'
      || normalizeUpgradeEmail(candidate.email) !== candidate.email
    ) throw new Error('Invalid pending email upgrade.');
    return candidate as PendingEmailUpgrade;
  } catch {
    await secureStorage.removeItem(EMAIL_UPGRADE_STORAGE_KEY);
    return null;
  }
}

async function writePendingEmailUpgrade(pending: PendingEmailUpgrade) {
  await secureStorage.setItem(EMAIL_UPGRADE_STORAGE_KEY, JSON.stringify(pending));
}

async function clearPendingEmailUpgrade() {
  await secureStorage.removeItem(EMAIL_UPGRADE_STORAGE_KEY);
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

async function pendingStateForUser(user: {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  is_anonymous?: boolean;
}) {
  const pending = await readPendingEmailUpgrade();
  if (!pending) return null;
  return resolveEmailUpgradeState(pending, user);
}

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
      // A confirmed email alone is not yet a recoverable password account.
      // Keep the app fail-closed until the second step sets a password. This
      // also keeps a resumable checkout on AuthScreen after a cold-start link.
      const pendingUpgrade = await pendingStateForUser(verified.user);
      if (pendingUpgrade) {
        return {
          userId: verified.user.id,
          email: pendingUpgrade.email,
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
    await clearPendingEmailUpgrade();
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
 * Begins the first half of an anonymous-to-password upgrade. Only the email,
 * UUID, and request time are retained; the password does not exist yet and is
 * never written to device storage.
 */
export async function beginAnonymousEmailUpgrade(email: string): Promise<EmailUpgradeState> {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  await ensureAnonymousSession();
  const { data: beforeData, error: beforeError } = await supabase.auth.getUser();
  if (beforeError) throw beforeError;
  const before = beforeData.user;
  if (!before) throw new Error('The local cloud identity could not be restored.');
  const normalizedEmail = normalizeUpgradeEmail(email);
  const existing = await readPendingEmailUpgrade();

  // A confirmation link can finish while the app is suspended. Re-entering
  // this screen must resume at the password step rather than changing owner.
  if (!before.is_anonymous) {
    const recovered = existing && resolveEmailUpgradeState(existing, before);
    if (recovered?.step === 'set-password' && recovered.email === normalizedEmail) return recovered;
    throw new Error('This device is already linked to a different account.');
  }

  const pending: PendingEmailUpgrade = {
    version: 1,
    userId: before.id,
    email: normalizedEmail,
    requestedAt: new Date().toISOString(),
  };
  // Store only non-secret recovery metadata before the request. If the network
  // loses the response after Supabase accepts it, the same flow can still be
  // resumed safely from its email link.
  await writePendingEmailUpgrade(pending);
  const { data, error } = await supabase.auth.updateUser(
    { email: normalizedEmail },
    { emailRedirectTo: anonymousEmailRedirectUri },
  );
  if (error) {
    // Remove a definitely rejected request, but retain the marker if the
    // follow-up check itself cannot establish whether the server accepted it.
    try {
      const { data: currentData, error: currentError } = await supabase.auth.getUser();
      if (currentError) throw currentError;
      const current = currentData.user;
      const serverEmail = normalizeUpgradeEmail(current?.new_email ?? current?.email ?? '');
      if (serverEmail !== normalizedEmail) await clearPendingEmailUpgrade();
    } catch { /* An indeterminate network result remains resumable. */ }
    throw error;
  }
  if (!data.user || data.user.id !== before.id) {
    throw new Error('Account identity changed unexpectedly. Contact support before continuing.');
  }

  const state = resolveEmailUpgradeState(pending, data.user);
  if (!state) throw new Error('Account identity changed unexpectedly. Contact support before continuing.');
  publishEmailUpgrade(state);
  return state;
}

export async function getAnonymousEmailUpgradeState(): Promise<EmailUpgradeState | null> {
  if (!supabase) return null;
  const pending = await readPendingEmailUpgrade();
  if (!pending) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) return null;
  const state = resolveEmailUpgradeState(pending, data.user);
  if (!state) {
    await clearPendingEmailUpgrade();
    return null;
  }
  return state;
}

export async function resendAnonymousEmailUpgrade(): Promise<EmailUpgradeState> {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const state = await getAnonymousEmailUpgradeState();
  if (!state) throw new Error('Start the email-linking step again.');
  if (state.step === 'set-password') return state;
  const { error } = await supabase.auth.resend({
    type: 'email_change',
    email: state.email,
    options: { emailRedirectTo: anonymousEmailRedirectUri },
  });
  if (error) throw error;
  return state;
}

/** Completes the second half only after Supabase verifies the same UUID/email. */
export async function completeAnonymousEmailUpgrade(password: string) {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const pending = await readPendingEmailUpgrade();
  if (!pending) throw new Error('Verify your email before setting a password.');
  const { data: beforeData, error: beforeError } = await supabase.auth.getUser();
  if (beforeError) throw beforeError;
  const before = beforeData.user;
  if (!before) throw new Error('The cloud identity could not be restored.');
  const state = resolveEmailUpgradeState(pending, before);
  if (state?.step !== 'set-password') throw new Error('Verify your email before setting a password.');

  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  if (!data.user || data.user.id !== pending.userId) {
    throw new Error('Account identity changed unexpectedly. Contact support before continuing.');
  }
  // RLS reads account state from access-token claims. Refresh only after both
  // factors are complete so Storage cannot treat a half-upgraded account as a
  // permanent upload identity in application code.
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw refreshError;
  const user = refreshed.session?.user;
  if (
    !user
    || user.id !== pending.userId
    || user.is_anonymous
    || normalizeUpgradeEmail(user.email ?? '') !== pending.email
  ) {
    throw new Error('The permanent account session could not be refreshed.');
  }
  await clearPendingEmailUpgrade();
  return user;
}

export function subscribeToEmailUpgrade(listener: EmailUpgradeListener) {
  emailUpgradeListeners.add(listener);
  return () => emailUpgradeListeners.delete(listener);
}

export async function permanentUploadIdentity() {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user || userData.user.is_anonymous) return null;
  if (await pendingStateForUser(userData.user)) return null;

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
  if (data.user) await clearPendingEmailUpgrade();
  return data.user;
}

export async function sendPasswordReset(email: string) {
  if (!supabase) throw new Error('Cloud accounts are not configured yet.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUri });
  if (error) throw error;
}

async function exchangeAuthCallback(url: string): Promise<User | null> {
  if (!supabase) return null;
  const parsed = new URL(url);
  if (!isExpectedAuthCallback(parsed, authRedirectUri)) return null;
  const callbackError = parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error');
  if (callbackError) throw new Error(callbackError.replace(/\+/g, ' '));
  const code = parsed.searchParams.get('code');
  if (!code) return null;
  const flowId = parsed.searchParams.get('sb_flow_id');
  const { data, error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  );
  if (error) throw error;
  const user = data.session?.user ?? null;
  if (!user) return null;
  if (!isEmailUpgradeCallback(parsed)) {
    const pending = await readPendingEmailUpgrade();
    if (pending && pending.userId !== user.id) await clearPendingEmailUpgrade();
    return user;
  }

  let pending = await readPendingEmailUpgrade();
  if (!pending) {
    const verifiedEmail = normalizeUpgradeEmail(user.email ?? '');
    if (!verifiedEmail || !user.email_confirmed_at || user.is_anonymous) {
      throw new Error('The email confirmation could not be matched to this device. Start again from account setup.');
    }
    pending = {
      version: 1,
      userId: user.id,
      email: verifiedEmail,
      requestedAt: new Date().toISOString(),
    };
  }

  const state = resolveEmailUpgradeState(pending, user);
  if (!state) {
    // The callback must never silently switch the UUID that owns the local
    // recordings. The newly exchanged session is discarded on mismatch.
    await clearLocalSessionVerified();
    await clearPendingEmailUpgrade();
    throw new Error('Email verification returned a different account. No local recordings were moved.');
  }
  await writePendingEmailUpgrade(pending);
  if (state.step !== 'set-password') {
    throw new Error('Supabase did not confirm the email. Request a new verification link and try again.');
  }
  publishEmailUpgrade(state);
  // AppContext treats any returned user as fully recoverable. Suppress that
  // transition until AuthScreen completes the password step.
  return null;
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
  await clearPendingEmailUpgrade();
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
    await clearPendingEmailUpgrade();
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
    if (data.user) await clearPendingEmailUpgrade();
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
  const user = await handleAuthCallback(result.url);
  if (user) await clearPendingEmailUpgrade();
  return user;
}

export function subscribeToAuthLinks(onUser: (userId: string, email?: string) => void) {
  let active = true;
  const receive = (url: string) => {
    let emailUpgrade = false;
    try {
      const parsed = new URL(url);
      if (!isExpectedAuthCallback(parsed, authRedirectUri)) return;
      emailUpgrade = isEmailUpgradeCallback(parsed);
    } catch { return; }
    void handleAuthCallback(url)
      .then((user) => { if (active && user) onUser(user.id, user.email); })
      .catch((caught: unknown) => {
        if (!active || !emailUpgrade) return;
        publishEmailUpgrade(null, caught instanceof Error ? caught : new Error('Email verification could not be completed.'));
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
  if (error) throw error;
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
  await clearPendingEmailUpgrade();
}

export async function clearLocalCloudSession() {
  try {
    await clearLocalSessionVerified();
  } catch {
    throw new Error('This device could not disconnect from the cloud account, so its recordings were left untouched. Check your connection and try again.');
  }
  await clearPendingEmailUpgrade();
}
