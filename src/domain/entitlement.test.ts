import { describe, expect, it } from 'vitest';

import { accessTierFromServer, targetForAccessTier } from '@/domain/entitlement';

describe('server-authoritative entitlement hydration', () => {
  it.each([
    ['paid90', 'granted', 'paid90'],
    ['paid30', 'granted', 'paid30'],
    ['paid90', 'refunded', 'trial'],
    ['paid90', 'revoked', 'trial'],
    ['paid30', 'refunded', 'trial'],
    ['paid30', 'verifying', 'trial'],
    ['trial', 'granted', 'trial'],
    ['trial', 'none', 'trial'],
  ] as const)('maps %s/%s to %s', (plan, status, expected) => {
    expect(accessTierFromServer(plan, status)).toBe(expected);
  });

  it('maps only the authoritative tier to the client journey length', () => {
    expect(targetForAccessTier('trial')).toBe(7);
    expect(targetForAccessTier('paid30')).toBe(30);
    expect(targetForAccessTier('paid90')).toBe(90);
  });
});
