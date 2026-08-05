export type NightStatus = 'future' | 'today' | 'sealed' | 'missed' | 'revealed';
export type BackupState = 'on-device' | 'waiting-account' | 'waiting-wifi' | 'uploading' | 'backed-up' | 'attention';

export type Night = {
  id: string;
  index: number;
  expectedLocalDate: string;
  timezone: string;
  questionId: string;
  questionVersion: string;
  status: NightStatus;
  recordedAt?: string;
  recordedHour?: number;
  durationSec?: number;
  localUri?: string;
  storagePath?: string;
  checksum?: string;
  byteSize?: number;
  backedUp?: boolean;
  backupState?: BackupState;
  revealAt?: string;
  visualSeed: number;
};

export type ChapterLength = 7 | 30 | 90;
export type AccessTier = 'trial' | 'paid30' | 'paid90';

export type Chapter = {
  id: string;
  length: ChapterLength;
  targetLength: ChapterLength;
  accessThrough: number;
  questionSet: 'set_a' | 'set_b' | 'set_c';
  startedAt: string;
  timezone: string;
  serverRevision: number;
  purchaseStatus?: 'none' | 'verifying' | 'granted' | 'refunded' | 'revoked';
  completedAt?: string;
  nights: Night[];
};

export type ReportEvidence = {
  nightId: string;
  nightIndex: number;
  segmentId: string;
  startMs: number;
  endMs: number;
  quote?: string;
};

export type ReportSection = {
  title: string;
  body: string;
  eyebrow?: string;
  evidence: ReportEvidence[];
};

export type Report = {
  id: string;
  chapterId: string;
  checkpointNight: 7 | 30 | 60 | 90;
  status: 'queued' | 'running' | 'ready' | 'failed';
  summary?: string;
  sections: ReportSection[];
  audioPath?: string;
  audioUrl?: string;
  generatedAt?: string;
  errorCode?: string;
  traceId?: string;
  reportVersion: string;
};

export type AuthState = 'local' | 'anonymous' | 'authenticated';

export type AppSnapshot = {
  schemaVersion: 2;
  onboarded: boolean;
  reminderHour: number;
  reminderMinute: number;
  timezone: string;
  notificationsEnabled: boolean;
  notificationPreview: 'question' | 'private';
  gentleNudge: boolean;
  authState: AuthState;
  ownerId?: string;
  displayName?: string;
  email?: string;
  accessTier: AccessTier;
  backupNetwork: 'wifi-only' | 'wifi-and-cellular';
  processingConsentVersion?: string;
  currentChapter: Chapter;
  completedChapters: Chapter[];
  reports: Report[];
  seenBackupPrompt: boolean;
  appearance: 'soft-feminine-premium' | 'dark';
  demoMode?: 'empty' | 'partial' | 'complete';
};

export type RouteName =
  | 'onboarding'
  | 'time-picker'
  | 'notification-primer'
  | 'home'
  | 'question'
  | 'sealing'
  | 'generating'
  | 'report'
  | 'gallery'
  | 'light-map'
  | 'settings'
  | 'popup-catalog'
  | 'paywall'
  | 'auth';

export type SheetId =
  | 'mic-primer'
  | 'mic-denied'
  | 'notifications-denied'
  | 'sealed'
  | 'short-recording'
  | 'leave-recording'
  | 'report-failed'
  | 'missed-nights'
  | 'trial-ended'
  | 'delete-all'
  | 'delete-confirm'
  | 'nothing-to-restore'
  | 'storage-low'
  | 'unbacked-signout'
  | 'reminder-tomorrow'
  | 'backup-prompt'
  | 'account-required'
  | 'duplicate-email'
  | 'chapter-open'
  | 'purchase-pending'
  | 'delete-account'
  | 'integration-placeholder';
