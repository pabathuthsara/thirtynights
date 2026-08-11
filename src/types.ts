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
export type ProductPlan = Extract<AccessTier, 'paid30' | 'paid90'>;
export type ReportCheckpoint = 7 | 30 | 60 | 90;
export type PaywallSource = 'night7_report' | 'locked_night8' | 'home_card' | 'settings_restore';

export type PurchaseIntent = {
  kind: 'purchase' | 'restore';
  plan: ProductPlan;
  /** Store identifier only. RevenueCat product objects are never persisted. */
  productId?: string;
  source: PaywallSource;
  localizedPrice?: string;
  returnStep: 'store-confirmation' | 'restore';
  /** One-time continuation key. It prevents an old checkout from replaying. */
  resumeToken: string;
  createdAt: string;
  expiresAt: string;
};

export type PurchaseVerification = {
  plan: ProductPlan;
  source: PaywallSource;
  status: 'store-confirming' | 'server-verifying' | 'pending-approval' | 'failed';
  localizedPrice?: string;
  transactionReference?: string;
  createdAt?: string;
  storeConfirmedAt?: string;
  updatedAt: string;
};

export type RestoreResult = {
  status: 'found' | 'not-found' | 'failed';
  store: 'app-store' | 'google-play';
  checkedAt: string;
};

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
  guidance?: string;
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

/** What someone said they came for, during onboarding. Optional everywhere:
 *  the answers only change what the app says back, never what it does. */
export type IntentionId = 'remember' | 'hear' | 'someone' | 'habit' | 'unwind';

export type AppSnapshot = {
  schemaVersion: 2;
  onboarded: boolean;
  onboardingVersion: number;
  intentions?: IntentionId[];
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
  processingConsentAcceptedAt?: string;
  processingConsentWithdrawnAt?: string;
  currentChapter: Chapter;
  completedChapters: Chapter[];
  reports: Report[];
  /** Set only after the first contextual setup screen has actually rendered. */
  reportSetupPromptShownAt?: string;
  /** A durable checkpoint surface; route state is never the only way back. */
  unresolvedCheckpoint?: ReportCheckpoint;
  seenBackupPrompt: boolean;
  backupPromptShownAt?: string;
  paywallSource?: PaywallSource;
  purchaseIntent?: PurchaseIntent;
  purchaseVerification?: PurchaseVerification;
  purchaseSuccessPending?: { plan: ProductPlan; verifiedAt: string };
  restoreResult?: RestoreResult;
  lastPurchaseInvitationAt?: string;
  appearance: 'soft-feminine-premium' | 'dark';
  demoMode?: 'empty' | 'partial' | 'complete';
};

export type RouteName =
  | 'onboarding'
  | 'time-picker'
  | 'home'
  | 'question'
  | 'sealing'
  | 'reward'
  | 'generating'
  | 'report'
  | 'gallery'
  | 'light-map'
  | 'settings'
  | 'popup-catalog'
  | 'dev-recordings'
  | 'paywall'
  | 'report-setup'
  | 'purchase-success'
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
