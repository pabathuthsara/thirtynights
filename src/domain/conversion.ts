import { isRecorded } from '@/domain/stats';
import type { AppSnapshot, ProductPlan, Report } from '@/types';

export type ReflectionReadinessState =
  | 'not-started'
  | 'account-needed'
  | 'consent-needed'
  | 'waiting-network'
  | 'uploading'
  | 'attention'
  | 'prepared'
  | 'processing'
  | 'ready'
  | 'failed';

export type ReflectionReadiness = {
  state: ReflectionReadinessState;
  recordedCount: number;
  unbackedCount: number;
  backedUpCount: number;
  checkpoint: 7 | 30 | 60 | 90;
  report?: Report;
};

export function reflectionReadiness(snapshot: AppSnapshot): ReflectionReadiness {
  const checkpoint = snapshot.unresolvedCheckpoint ?? 7;
  // Report readiness belongs to one checkpoint. A newly sealed Night 8 must
  // not hide an already-ready Night 7 reflection just because that later take
  // has not backed up yet; whole-chapter backup status is surfaced separately.
  const recorded = snapshot.currentChapter.nights.filter((night) => night.index <= checkpoint && isRecorded(night));
  const unbacked = recorded.filter((night) => !night.backedUp);
  const report = snapshot.reports.find((candidate) => (
    candidate.chapterId === snapshot.currentChapter.id && candidate.checkpointNight === checkpoint
  ));

  let state: ReflectionReadinessState = 'not-started';
  if (recorded.length) {
    if (snapshot.authState !== 'authenticated') state = 'account-needed';
    else if (!snapshot.processingConsentVersion) state = 'consent-needed';
    else if (unbacked.some((night) => night.backupState === 'attention')) state = 'attention';
    else if (unbacked.some((night) => night.backupState === 'uploading')) state = 'uploading';
    else if (unbacked.length) state = 'waiting-network';
    else if (report?.status === 'ready') state = 'ready';
    else if (report?.status === 'failed') state = 'failed';
    else if (report?.status === 'queued' || report?.status === 'running' || snapshot.unresolvedCheckpoint) state = 'processing';
    else state = 'prepared';
  }

  return {
    state,
    recordedCount: recorded.length,
    unbackedCount: unbacked.length,
    backedUpCount: recorded.length - unbacked.length,
    checkpoint,
    report,
  };
}

export function reflectionSetupIncomplete(snapshot: AppSnapshot) {
  // Developer previews are deliberately detached from cloud state. Treating a
  // preview recording as reflection setup work produces a convincing but false
  // "Back up now" loop because synchronize() correctly refuses to upload it.
  if (snapshot.demoMode) return false;
  const readiness = reflectionReadiness(snapshot);
  return readiness.recordedCount > 0 && (
    readiness.state === 'account-needed'
    || readiness.state === 'consent-needed'
    || readiness.state === 'waiting-network'
    || readiness.state === 'uploading'
    || readiness.state === 'attention'
  );
}

export function shouldShowFirstReflectionSetup(snapshot: AppSnapshot) {
  return !snapshot.demoMode
    && !snapshot.reportSetupPromptShownAt
    && reflectionReadiness(snapshot).recordedCount >= 1
    && reflectionSetupIncomplete(snapshot);
}

export function shouldShowBackupReminder(snapshot: AppSnapshot) {
  return !snapshot.demoMode
    && !snapshot.seenBackupPrompt
    && reflectionReadiness(snapshot).recordedCount >= 3
    && reflectionSetupIncomplete(snapshot);
}

export function entitlementCovers(accessTier: AppSnapshot['accessTier'], plan: ProductPlan) {
  if (accessTier === 'paid90') return true;
  return plan === 'paid30' && accessTier === 'paid30';
}
