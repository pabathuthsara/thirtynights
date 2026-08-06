import { describe, expect, it } from 'vitest';

import { moonIllumination, moonPhase } from '@/domain/moon';

/** Reference new/full moons (UTC) from published ephemerides. */
const NEW_MOON = new Date(Date.UTC(2026, 7, 12, 17, 37));
const FULL_MOON = new Date(Date.UTC(2026, 6, 29, 14, 36));

describe('moonPhase', () => {
  it('stays within a single synodic cycle', () => {
    for (const date of [new Date(0), NEW_MOON, FULL_MOON, new Date(Date.UTC(2031, 0, 1))]) {
      const phase = moonPhase(date);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });

  it('reads near-new at a real new moon', () => {
    // The cycle wraps at new, so either limb of the range counts.
    const phase = moonPhase(NEW_MOON);
    expect(Math.min(phase, 1 - phase)).toBeLessThan(0.04);
    expect(moonIllumination(NEW_MOON)).toBeLessThan(0.06);
  });

  it('reads near-full at a real full moon', () => {
    expect(Math.abs(moonPhase(FULL_MOON) - 0.5)).toBeLessThan(0.04);
    expect(moonIllumination(FULL_MOON)).toBeGreaterThan(0.94);
  });

  it('advances a quarter cycle in a week', () => {
    // Measured modulo the cycle: a reference new moon can sit just *below* 1
    // rather than just above 0, and a week later has wrapped past it.
    const start = moonPhase(NEW_MOON);
    const week = moonPhase(new Date(NEW_MOON.getTime() + 7 * 86_400_000));
    const advanced = (week - start + 1) % 1;
    expect(advanced).toBeGreaterThan(0.2);
    expect(advanced).toBeLessThan(0.3);
  });

  it('is symmetric about the full moon', () => {
    const before = moonIllumination(new Date(FULL_MOON.getTime() - 3 * 86_400_000));
    const after = moonIllumination(new Date(FULL_MOON.getTime() + 3 * 86_400_000));
    expect(Math.abs(before - after)).toBeLessThan(0.05);
  });
});
