import { describe, expect, it } from 'vitest';

import {
  isPasswordRecoveryCallback,
  isExpectedAuthCallback,
  normalizeRecoveryEmail,
  passwordRecoveryRedirectUri,
  passwordRecoveryUserMatches,
  type PendingPasswordRecovery,
} from '@/lib/passwordRecovery';

const pending: PendingPasswordRecovery = {
  version: 1,
  email: 'person@example.com',
  requestedAt: '2026-08-18T08:00:00.000Z',
  step: 'set-password',
};

describe('password recovery guards', () => {
  it('normalizes the address without ever storing a password', () => {
    expect(normalizeRecoveryEmail(' Person@Example.COM ')).toBe('person@example.com');
    expect(Object.keys(pending)).not.toContain('password');
  });

  it('recognizes only callbacks created for password recovery', () => {
    const redirect = passwordRecoveryRedirectUri('thirtynights://auth/callback');
    expect(isPasswordRecoveryCallback(new URL(`${redirect}&code=one-time-code`))).toBe(true);
    expect(isPasswordRecoveryCallback(new URL('thirtynights://auth/callback?code=one-time-code'))).toBe(false);
    expect(isExpectedAuthCallback(new URL(`${redirect}&code=one-time-code`), 'thirtynights://auth/callback')).toBe(true);
    expect(isExpectedAuthCallback(new URL('thirtynights://other/callback?code=x'), 'thirtynights://auth/callback')).toBe(false);
  });

  it('allows a password change only for the confirmed email from the recovery request', () => {
    expect(passwordRecoveryUserMatches(pending, {
      email: 'PERSON@example.com',
      email_confirmed_at: '2026-08-18T08:05:00.000Z',
      is_anonymous: false,
    })).toBe(true);
    expect(passwordRecoveryUserMatches(pending, {
      email: 'other@example.com',
      email_confirmed_at: '2026-08-18T08:05:00.000Z',
      is_anonymous: false,
    })).toBe(false);
    expect(passwordRecoveryUserMatches({ ...pending, step: 'email-sent' }, {
      email: 'person@example.com',
      email_confirmed_at: '2026-08-18T08:05:00.000Z',
      is_anonymous: false,
    })).toBe(false);
  });
});
