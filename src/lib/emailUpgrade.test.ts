import { describe, expect, it } from 'vitest';

import {
  emailUpgradeRedirectUri,
  emailUpgradeState,
  isEmailUpgradeCallback,
  isExpectedAuthCallback,
  normalizeUpgradeEmail,
  type PendingEmailUpgrade,
} from '@/lib/emailUpgrade';

const pending: PendingEmailUpgrade = {
  version: 1,
  userId: 'same-user',
  email: 'person@example.com',
  requestedAt: '2026-08-10T20:00:00.000Z',
};

describe('anonymous email upgrade guards', () => {
  it('normalizes the address without retaining a password', () => {
    expect(normalizeUpgradeEmail(' Person@Example.COM ')).toBe('person@example.com');
    expect(Object.keys(pending)).not.toContain('password');
  });

  it('marks only a confirmed, permanent, same-UUID identity ready for a password', () => {
    expect(emailUpgradeState(pending, {
      id: 'same-user',
      email: 'PERSON@example.com',
      email_confirmed_at: '2026-08-10T20:05:00.000Z',
      is_anonymous: false,
    })?.step).toBe('set-password');

    expect(emailUpgradeState(pending, {
      id: 'same-user',
      email: 'person@example.com',
      is_anonymous: true,
    })?.step).toBe('verify-email');

    expect(emailUpgradeState(pending, {
      id: 'different-user',
      email: 'person@example.com',
      email_confirmed_at: '2026-08-10T20:05:00.000Z',
      is_anonymous: false,
    })).toBeNull();
  });

  it('recognizes only the app callback path while preserving the email-upgrade purpose', () => {
    const redirect = emailUpgradeRedirectUri('thirtynights://auth/callback');
    const callback = new URL(`${redirect}&code=one-time-code`);

    expect(isEmailUpgradeCallback(callback)).toBe(true);
    expect(isExpectedAuthCallback(callback, 'thirtynights://auth/callback')).toBe(true);
    expect(isExpectedAuthCallback(new URL('thirtynights://other/callback?code=x'), 'thirtynights://auth/callback')).toBe(false);
  });
});
