export type QueueMonitorThresholds = {
  staleJobMinutes: number;
  repeatedFailureAttempts: number;
  failureWindowMinutes: number;
  alertCooldownMinutes: number;
};

export type QueueMonitorRow = {
  stale_job_count: number;
  repeated_failure_job_count: number;
  oldest_stale_job_at: string | null;
};

export type QueueMonitorSnapshot = {
  status: 'ok' | 'alert';
  checkedAt: string;
  staleJobCount: number;
  repeatedFailureJobCount: number;
  oldestStaleJobAt: string | null;
};

export type AlertDecision = 'none' | 'firing' | 'resolved';

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function queueMonitorThresholds(environment: NodeJS.ProcessEnv): QueueMonitorThresholds {
  return {
    staleJobMinutes: positiveInteger(environment.WORKER_STALE_JOB_MINUTES, 45, 'WORKER_STALE_JOB_MINUTES'),
    repeatedFailureAttempts: positiveInteger(environment.WORKER_FAILURE_ATTEMPTS, 3, 'WORKER_FAILURE_ATTEMPTS'),
    failureWindowMinutes: positiveInteger(environment.WORKER_FAILURE_WINDOW_MINUTES, 60, 'WORKER_FAILURE_WINDOW_MINUTES'),
    alertCooldownMinutes: positiveInteger(environment.WORKER_ALERT_COOLDOWN_MINUTES, 30, 'WORKER_ALERT_COOLDOWN_MINUTES'),
  };
}

export function queueMonitorSnapshot(row: QueueMonitorRow, checkedAt: Date): QueueMonitorSnapshot {
  const staleJobCount = Number(row.stale_job_count);
  const repeatedFailureJobCount = Number(row.repeated_failure_job_count);
  return {
    status: staleJobCount > 0 || repeatedFailureJobCount > 0 ? 'alert' : 'ok',
    checkedAt: checkedAt.toISOString(),
    staleJobCount,
    repeatedFailureJobCount,
    oldestStaleJobAt: row.oldest_stale_job_at,
  };
}

export function queueAlertDecision(
  previousStatus: QueueMonitorSnapshot['status'] | 'unknown',
  snapshot: QueueMonitorSnapshot,
  lastAlertAt: number,
  now: number,
  cooldownMinutes: number,
): AlertDecision {
  if (snapshot.status === 'ok') return previousStatus === 'alert' ? 'resolved' : 'none';
  if (previousStatus !== 'alert') return 'firing';
  return now - lastAlertAt >= cooldownMinutes * 60_000 ? 'firing' : 'none';
}
