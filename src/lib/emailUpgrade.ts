export const EMAIL_UPGRADE_STORAGE_KEY = 'email-upgrade.v1';
export const EMAIL_UPGRADE_PURPOSE = 'anonymous-email-upgrade';

export type PendingEmailUpgrade = {
  version: 1;
  userId: string;
  email: string;
  requestedAt: string;
};

export type EmailUpgradeState = {
  step: 'verify-email' | 'set-password';
  userId: string;
  email: string;
};

export type EmailUpgradeUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  is_anonymous?: boolean;
};

export function normalizeUpgradeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function emailUpgradeRedirectUri(authRedirectUri: string) {
  const redirect = new URL(authRedirectUri);
  redirect.searchParams.set('purpose', EMAIL_UPGRADE_PURPOSE);
  return redirect.toString();
}

export function isEmailUpgradeCallback(url: URL) {
  return url.searchParams.get('purpose') === EMAIL_UPGRADE_PURPOSE;
}

export function isExpectedAuthCallback(url: URL, authRedirectUri: string) {
  const expected = new URL(authRedirectUri);
  return url.protocol === expected.protocol
    && url.hostname === expected.hostname
    && url.port === expected.port
    && url.pathname === expected.pathname;
}

export function emailUpgradeState(
  pending: PendingEmailUpgrade,
  user: EmailUpgradeUser,
): EmailUpgradeState | null {
  if (user.id !== pending.userId) return null;
  const verified = !user.is_anonymous
    && Boolean(user.email_confirmed_at)
    && normalizeUpgradeEmail(user.email ?? '') === pending.email;
  return {
    step: verified ? 'set-password' : 'verify-email',
    userId: pending.userId,
    email: pending.email,
  };
}
