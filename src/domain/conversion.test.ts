import { describe, expect, it } from 'vitest';

import {
  entitlementCovers,
  reflectionReadiness,
  reflectionSetupIncomplete,
  shouldShowBackupReminder,
  shouldShowFirstReflectionSetup,
} from '@/domain/conversion';
import { reconcileSnapshot } from '@/domain/calendar';
import type { AppSnapshot, Night, Report } from '@/types';

const CHAPTER_ID = '10000000-0000-4000-8000-000000000000';
const NOW = '2026-08-10T20:00:00.000Z';

function night(index: number, status: Night['status'] = 'future', overrides: Partial<Night> = {}): Night {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    index,
    expectedLocalDate: `2026-08-${String(index + 3).padStart(2, '0')}`,
    timezone: 'Asia/Colombo',
    questionId: `set_a_${String(index).padStart(2, '0')}`,
    questionVersion: '2026-08-v1',
    status,
    visualSeed: index,
    backupState: 'on-device',
    ...overrides,
  };
}

function sealedNight(index: number, backedUp = false): Night {
  return night(index, 'sealed', {
    recordedAt: NOW,
    durationSec: 42,
    backedUp,
    backupState: backedUp ? 'backed-up' : 'waiting-account',
  });
}

function snapshot(nights: Night[], overrides: Partial<AppSnapshot> = {}): AppSnapshot {
  const value: AppSnapshot = {
    schemaVersion: 2,
    onboarded: true,
    onboardingVersion: 2,
    reminderHour: 22,
    reminderMinute: 0,
    timezone: 'Asia/Colombo',
    notificationsEnabled: false,
    notificationPreview: 'private',
    gentleNudge: false,
    authState: 'local',
    accessTier: 'trial',
    backupNetwork: 'wifi-only',
    currentChapter: {
      id: CHAPTER_ID,
      length: 7,
      targetLength: 7,
      accessThrough: 7,
      questionSet: 'set_a',
      startedAt: '2026-08-04T00:00:00.000Z',
      timezone: 'Asia/Colombo',
      serverRevision: 0,
      purchaseStatus: 'none',
      nights,
    },
    completedChapters: [],
    reports: [],
    seenBackupPrompt: false,
    appearance: 'soft-feminine-premium',
  };

  return { ...value, ...overrides };
}

function report(status: Report['status']): Report {
  return {
    id: `report-${status}`,
    chapterId: CHAPTER_ID,
    checkpointNight: 7,
    status,
    sections: [],
    reportVersion: 'v1',
  };
}

describe('reflection conversion milestones', () => {
  it('does not present reflection setup after the first local seal', () => {
    const firstSeal = snapshot([sealedNight(1)]);

    expect(reflectionReadiness(firstSeal)).toMatchObject({
      state: 'account-needed',
      recordedCount: 1,
      unbackedCount: 1,
      backedUpCount: 0,
      checkpoint: 7,
    });
    expect(reflectionSetupIncomplete(firstSeal)).toBe(true);
    expect(reflectionReadiness(firstSeal).checkpointDue).toBe(false);
    expect(shouldShowFirstReflectionSetup(firstSeal)).toBe(false);
  });

  it('does not present reflection setup for an early seal after a missed night', () => {
    const firstSeal = snapshot([night(1, 'missed'), sealedNight(2)]);

    expect(reflectionReadiness(firstSeal).recordedCount).toBe(1);
    expect(shouldShowFirstReflectionSetup(firstSeal)).toBe(false);
  });

  it('does not repeat the first setup prompt after that surface was shown', () => {
    const shown = snapshot([sealedNight(1)], { reportSetupPromptShownAt: NOW });

    expect(reflectionSetupIncomplete(shown)).toBe(true);
    expect(shouldShowFirstReflectionSetup(shown)).toBe(false);
  });

  it('never presents cloud setup or backup reminders for local-only developer previews', () => {
    const preview = snapshot(
      [sealedNight(1), sealedNight(2), sealedNight(3)],
      { demoMode: 'empty' },
    );

    // Readiness remains inspectable for the preview catalog, but no production
    // conversion surface may claim that this detached chapter can upload.
    expect(reflectionReadiness(preview).recordedCount).toBe(3);
    expect(reflectionSetupIncomplete(preview)).toBe(false);
    expect(shouldShowFirstReflectionSetup(preview)).toBe(false);
    expect(shouldShowBackupReminder(preview)).toBe(false);
  });

  it('recognizes a fully backed, consented pre-checkpoint setup as prepared', () => {
    const prepared = snapshot([sealedNight(1, true)], {
      authState: 'authenticated',
      processingConsentVersion: 'processing-v1',
    });

    expect(reflectionReadiness(prepared)).toMatchObject({
      state: 'prepared',
      checkpoint: 7,
      recordedCount: 1,
      unbackedCount: 0,
    });
    expect(reflectionSetupIncomplete(prepared)).toBe(false);
  });

  it('uses three recorded nights for the backup reminder and tracks it independently', () => {
    const twoSeals = snapshot([sealedNight(1), sealedNight(2)]);
    const threeSeals = snapshot(
      [sealedNight(1), sealedNight(2), sealedNight(3)],
      { reportSetupPromptShownAt: NOW },
    );

    expect(shouldShowBackupReminder(twoSeals)).toBe(false);
    expect(shouldShowBackupReminder(threeSeals)).toBe(true);
    expect(shouldShowBackupReminder({
      ...threeSeals,
      seenBackupPrompt: true,
      backupPromptShownAt: NOW,
    })).toBe(false);
  });

  it.each([
    ['missed', 6],
    ['sealed', 7],
  ] as const)('keeps a %s night-seven checkpoint durable outside route state', (nightSevenStatus, recordedCount) => {
    const nights = Array.from({ length: 6 }, (_, offset) => sealedNight(offset + 1, true));
    nights.push(nightSevenStatus === 'sealed' ? sealedNight(7, true) : night(7, 'missed'));
    const checkpoint = snapshot(nights, {
      authState: 'authenticated',
      processingConsentVersion: 'processing-v1',
      unresolvedCheckpoint: 7,
    });

    expect(reflectionReadiness(checkpoint)).toMatchObject({
      state: 'processing',
      recordedCount,
      unbackedCount: 0,
      checkpoint: 7,
      checkpointDue: true,
    });
    expect(reflectionSetupIncomplete(checkpoint)).toBe(false);
  });

  it.each([
    ['ready', 'ready'],
    ['failed', 'failed'],
  ] as const)('surfaces a %s checkpoint report as %s', (reportStatus, expectedState) => {
    const checkpointReport = report(reportStatus);
    const value = snapshot(
      Array.from({ length: 7 }, (_, offset) => sealedNight(offset + 1, true)),
      {
        authState: 'authenticated',
        processingConsentVersion: 'processing-v1',
        unresolvedCheckpoint: 7,
        reports: [checkpointReport],
      },
    );

    expect(reflectionReadiness(value)).toMatchObject({
      state: expectedState,
      checkpoint: 7,
      report: checkpointReport,
    });
  });

  it('keeps a ready night-seven report ready while a later night waits to back up', () => {
    const firstSeven = Array.from({ length: 7 }, (_, offset) => sealedNight(offset + 1, true));
    const nightEight = sealedNight(8, false);
    const checkpointReport = report('ready');
    const value = snapshot([...firstSeven, nightEight], {
      accessTier: 'paid30',
      authState: 'authenticated',
      processingConsentVersion: 'processing-v1',
      reports: [checkpointReport],
      currentChapter: {
        ...snapshot([]).currentChapter,
        length: 30,
        targetLength: 30,
        accessThrough: 30,
        nights: [...firstSeven, nightEight],
      },
    });

    expect(reflectionReadiness(value)).toMatchObject({
      state: 'ready',
      checkpoint: 7,
      recordedCount: 7,
      unbackedCount: 0,
      report: checkpointReport,
    });
  });
});

describe('entitlement coverage', () => {
  it.each([
    ['trial', 'paid30', false],
    ['trial', 'paid90', false],
    ['paid30', 'paid30', true],
    ['paid30', 'paid90', false],
    ['paid90', 'paid30', true],
    ['paid90', 'paid90', true],
  ] as const)('%s entitlement covering %s is %s', (accessTier, plan, expected) => {
    expect(entitlementCovers(accessTier, plan)).toBe(expected);
  });
});

describe('checkpoint reconciliation', () => {
  it('does not recreate the night-seven conversion checkpoint after the 30-night grant', () => {
    const firstSeven = Array.from({ length: 7 }, (_, offset) => sealedNight(offset + 1, true));
    const remaining = Array.from({ length: 23 }, (_, offset) => night(offset + 8));
    const paid = snapshot([...firstSeven, ...remaining], {
      accessTier: 'paid30',
      unresolvedCheckpoint: 7,
      currentChapter: {
        ...snapshot([]).currentChapter,
        length: 30,
        targetLength: 30,
        accessThrough: 30,
        nights: [...firstSeven, ...remaining],
      },
    });

    expect(reconcileSnapshot(paid, new Date(NOW)).unresolvedCheckpoint).toBeUndefined();
  });

  it('advances a retained checkpoint when a later paid-90 checkpoint becomes eligible', () => {
    const firstSixty = Array.from({ length: 60 }, (_, offset) => sealedNight(offset + 1, true));
    const remaining = Array.from({ length: 30 }, (_, offset) => night(offset + 61));
    const paid = snapshot([...firstSixty, ...remaining], {
      accessTier: 'paid90',
      unresolvedCheckpoint: 30,
      currentChapter: {
        ...snapshot([]).currentChapter,
        length: 90,
        targetLength: 90,
        accessThrough: 90,
        nights: [...firstSixty, ...remaining],
      },
    });

    expect(reconcileSnapshot(paid, new Date(NOW)).unresolvedCheckpoint).toBe(60);
  });
});
