import { describe, expect, it } from 'vitest';

import {
  queueAlertDecision,
  queueMonitorSnapshot,
  queueMonitorThresholds,
} from '../src/monitoring.js';

describe('worker queue monitoring', () => {
  it('uses conservative defaults and rejects invalid operational thresholds', () => {
    expect(queueMonitorThresholds({})).toEqual({
      staleJobMinutes: 45,
      repeatedFailureAttempts: 3,
      failureWindowMinutes: 60,
      alertCooldownMinutes: 30,
    });
    expect(() => queueMonitorThresholds({ WORKER_FAILURE_ATTEMPTS: '0' })).toThrow('positive integer');
  });

  it('alerts for stale work or repeated failures and emits one resolution transition', () => {
    const alert = queueMonitorSnapshot({
      stale_job_count: 2,
      repeated_failure_job_count: 1,
      oldest_stale_job_at: '2026-08-18T07:00:00.000Z',
    }, new Date('2026-08-18T08:00:00.000Z'));
    const healthy = queueMonitorSnapshot({
      stale_job_count: 0,
      repeated_failure_job_count: 0,
      oldest_stale_job_at: null,
    }, new Date('2026-08-18T08:05:00.000Z'));

    expect(alert.status).toBe('alert');
    expect(queueAlertDecision('unknown', alert, 0, Date.parse(alert.checkedAt), 30)).toBe('firing');
    expect(queueAlertDecision('alert', alert, Date.parse(alert.checkedAt), Date.parse(alert.checkedAt) + 10 * 60_000, 30)).toBe('none');
    expect(queueAlertDecision('alert', alert, Date.parse(alert.checkedAt), Date.parse(alert.checkedAt) + 31 * 60_000, 30)).toBe('firing');
    expect(queueAlertDecision('alert', healthy, Date.parse(alert.checkedAt), Date.parse(healthy.checkedAt), 30)).toBe('resolved');
    expect(queueAlertDecision('ok', healthy, Date.parse(alert.checkedAt), Date.parse(healthy.checkedAt), 30)).toBe('none');
  });
});
