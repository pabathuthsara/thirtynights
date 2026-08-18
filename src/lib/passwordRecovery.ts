export const PASSWORD_RECOVERY_STORAGE_KEY = 'password-recovery.v1';
export const PASSWORD_RECOVERY_PURPOSE = 'password-recovery';

export type PasswordRecoveryStep = 'email-sent' | 'set-password';

export type PendingPasswordRecovery = {
  version: 1;
  email: string;
  requestedAt: string;
  step: PasswordRecoveryStep;
};

export type PasswordRecoveryUser = {
  email?: string;
  email_confirmed_at?: string;
  is_anonymous?: boolean;
};

export function normalizeRecoveryEmail(email: string) {
  return email.trim().toLowerCase();
}

export function passwordRecoveryRedirectUri(authRedirectUri: string) {
  const redirect = new URL(authRedirectUri);
  redirect.searchParams.set('purpose', PASSWORD_RECOVERY_PURPOSE);
  return redirect.toString();
}

export function isPasswordRecoveryCallback(url: URL) {
  return url.searchParams.get('purpose') === PASSWORD_RECOVERY_PURPOSE;
}

export function isExpectedAuthCallback(url: URL, authRedirectUri: string) {
  const expected = new URL(authRedirectUri);
  return url.protocol === expected.protocol
    && url.hostname === expected.hostname
    && url.port === expected.port
    && url.pathname === expected.pathname;
}

export function passwordRecoveryUserMatches(
  pending: PendingPasswordRecovery,
  user: PasswordRecoveryUser,
) {
  return pending.step === 'set-password'
    && !user.is_anonymous
    && Boolean(user.email_confirmed_at)
    && normalizeRecoveryEmail(user.email ?? '') === pending.email;
}
