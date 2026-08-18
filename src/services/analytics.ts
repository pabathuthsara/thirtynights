import type { PaywallSource, ProductPlan, ReportCheckpoint } from '@/types';

export type OnboardingStep = 'value' | 'journey' | 'intentions' | 'reminder' | 'plan';
export type AccountMethod = 'email';
export type PaywallVariant = 'direct_30' | 'compare_plans';
export type StoreName = 'app_store' | 'google_play';
export type MilestoneNight = 3 | 6 | 7 | 8 | 30 | 60 | 90;
export type ReportSetupNight = 1 | 3 | 6 | 7;

type OnboardingContext = { step: OnboardingStep; version: number };
type MilestoneContext = { night: MilestoneNight };
type ReportSetupContext = { afterNight: ReportSetupNight };
type AccountContext = { method: AccountMethod };
type ConsentContext = { disclosureVersion: number };
type UploadContext = { itemCount: number };
type UploadWaitingContext = UploadContext & { reason: 'account' | 'consent' | 'network' };
type CheckpointContext = { checkpoint: ReportCheckpoint };
type PaywallContext = { source: PaywallSource; variant: PaywallVariant };
type PlanContext = { plan: ProductPlan; source: PaywallSource };
type CheckoutFailureContext = PlanContext & { stage: 'configuration' | 'store' | 'server' };
type CheckoutGrantContext = PlanContext & { grantLatencyMs: number };
type RestoreContext = { store: StoreName };
type RestoreFoundContext = RestoreContext & { plan: ProductPlan };
type PurchaseContext = { plan: ProductPlan };

/**
 * The complete analytics vocabulary. Properties intentionally contain only
 * bounded numbers, booleans, and fixed enums. Never add user-entered strings,
 * object identifiers, URLs, error messages, or voice/report content here.
 */
export type AnalyticsEventProperties = {
  app_first_opened: undefined;
  onboarding_viewed: OnboardingContext;
  onboarding_completed: OnboardingContext;
  onboarding_skipped: OnboardingContext;
  reminder_time_accepted: undefined;
  notification_prompt_shown: undefined;
  notification_permission_granted: undefined;
  notification_permission_denied: undefined;
  microphone_primer_shown: undefined;
  microphone_prompt_shown: undefined;
  microphone_permission_granted: undefined;
  microphone_permission_denied: undefined;
  first_recording_started: undefined;
  first_recording_sealed: undefined;
  milestone_night_sealed: MilestoneContext;
  milestone_night_missed: MilestoneContext;
  report_setup_viewed: ReportSetupContext;
  report_setup_accepted: ReportSetupContext;
  report_setup_deferred: ReportSetupContext;
  account_started: AccountContext;
  account_completed: AccountContext;
  account_failed: AccountContext;
  processing_permission_accepted: ConsentContext;
  processing_permission_withdrawn: ConsentContext;
  upload_waiting: UploadWaitingContext;
  upload_started: UploadContext;
  upload_completed: UploadContext;
  upload_failed: UploadContext;
  checkpoint_report_queued: CheckpointContext;
  checkpoint_report_ready: CheckpointContext;
  checkpoint_report_failed: CheckpointContext;
  checkpoint_report_viewed: CheckpointContext;
  checkpoint_report_listened: CheckpointContext;
  paywall_viewed: PaywallContext;
  plan_selected: PlanContext;
  checkout_started: PlanContext;
  checkout_cancelled: PlanContext;
  checkout_pending: PlanContext;
  checkout_store_success: PlanContext;
  checkout_server_granted: CheckoutGrantContext;
  checkout_failed: CheckoutFailureContext;
  restore_started: RestoreContext;
  restore_found: RestoreFoundContext;
  restore_not_found: RestoreContext;
  restore_failed: RestoreContext;
  locked_night_8_tapped: undefined;
  purchase_success_screen_viewed: PurchaseContext;
  night_8_opened: PurchaseContext;
};

export type AnalyticsEventName = keyof AnalyticsEventProperties;
export type AnalyticsSessionId = `session_${string}`;

type EmptyProperties = Readonly<Record<string, never>>;

export type AnalyticsEventFor<Name extends AnalyticsEventName> = Readonly<{
  name: Name;
  occurredAt: string;
  /** Ephemeral for this app process/session; never an account or device ID. */
  sessionId: AnalyticsSessionId;
  /** Starts at one for each new ephemeral session. */
  sequence: number;
  properties: AnalyticsEventProperties[Name] extends undefined
    ? EmptyProperties
    : Readonly<AnalyticsEventProperties[Name]>;
}>;

export type AnalyticsEvent = {
  [Name in AnalyticsEventName]: AnalyticsEventFor<Name>;
}[AnalyticsEventName];

type TrackArguments<Name extends AnalyticsEventName> = AnalyticsEventProperties[Name] extends undefined
  ? [properties?: undefined]
  : [properties: Readonly<AnalyticsEventProperties[Name]>];

export type AnalyticsSubscriber = (event: AnalyticsEvent) => void;

export type AnalyticsClient = {
  readonly sessionId: AnalyticsSessionId;
  track<Name extends AnalyticsEventName>(
    name: Name,
    ...args: TrackArguments<Name>
  ): AnalyticsEventFor<Name>;
  subscribe(subscriber: AnalyticsSubscriber): () => void;
  /** Rotate this on a genuine new app session. The value is never persisted. */
  startSession(): AnalyticsSessionId;
};

export class AnalyticsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyticsValidationError';
  }
}

type Validator<Value = unknown> = (value: unknown) => value is Value;
type RuntimeSchema<Properties> = Properties extends undefined
  ? undefined
  : { readonly [Key in keyof Properties]-?: Validator<Properties[Key]> };

function oneOf<const Values extends readonly (string | number | boolean)[]>(values: Values): Validator<Values[number]> {
  const allowed = new Set<string | number | boolean>(values);
  return (value: unknown): value is Values[number] => allowed.has(value as Values[number]);
}

function integerBetween(minimum: number, maximum: number): Validator<number> {
  return (value: unknown): value is number => (
    typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= minimum
    && value <= maximum
  );
}

const onboardingSchema: RuntimeSchema<OnboardingContext> = {
  step: oneOf(['value', 'journey', 'intentions', 'reminder', 'plan'] as const),
  version: integerBetween(1, 100),
};
const milestoneSchema: RuntimeSchema<MilestoneContext> = {
  night: oneOf([3, 6, 7, 8, 30, 60, 90] as const),
};
const reportSetupSchema: RuntimeSchema<ReportSetupContext> = {
  afterNight: oneOf([1, 3, 6, 7] as const),
};
const accountSchema: RuntimeSchema<AccountContext> = {
  method: oneOf(['email'] as const),
};
const consentSchema: RuntimeSchema<ConsentContext> = {
  disclosureVersion: integerBetween(1, 100),
};
const uploadSchema: RuntimeSchema<UploadContext> = {
  itemCount: integerBetween(0, 90),
};
const uploadWaitingSchema: RuntimeSchema<UploadWaitingContext> = {
  itemCount: integerBetween(0, 90),
  reason: oneOf(['account', 'consent', 'network'] as const),
};
const checkpointSchema: RuntimeSchema<CheckpointContext> = {
  checkpoint: oneOf([7, 30, 60, 90] as const),
};
const paywallSchema: RuntimeSchema<PaywallContext> = {
  source: oneOf(['night7_report', 'locked_night8', 'home_card', 'settings_restore'] as const),
  variant: oneOf(['direct_30', 'compare_plans'] as const),
};
const planSchema: RuntimeSchema<PlanContext> = {
  plan: oneOf(['paid30', 'paid90'] as const),
  source: oneOf(['night7_report', 'locked_night8', 'home_card', 'settings_restore'] as const),
};
const checkoutFailureSchema: RuntimeSchema<CheckoutFailureContext> = {
  ...planSchema,
  stage: oneOf(['configuration', 'store', 'server'] as const),
};
const checkoutGrantSchema: RuntimeSchema<CheckoutGrantContext> = {
  ...planSchema,
  grantLatencyMs: integerBetween(0, 365 * 24 * 60 * 60 * 1000),
};
const restoreSchema: RuntimeSchema<RestoreContext> = {
  store: oneOf(['app_store', 'google_play'] as const),
};
const restoreFoundSchema: RuntimeSchema<RestoreFoundContext> = {
  ...restoreSchema,
  plan: oneOf(['paid30', 'paid90'] as const),
};
const purchaseSchema: RuntimeSchema<PurchaseContext> = {
  plan: oneOf(['paid30', 'paid90'] as const),
};

const EVENT_SCHEMAS: { readonly [Name in AnalyticsEventName]: RuntimeSchema<AnalyticsEventProperties[Name]> } = {
  app_first_opened: undefined,
  onboarding_viewed: onboardingSchema,
  onboarding_completed: onboardingSchema,
  onboarding_skipped: onboardingSchema,
  reminder_time_accepted: undefined,
  notification_prompt_shown: undefined,
  notification_permission_granted: undefined,
  notification_permission_denied: undefined,
  microphone_primer_shown: undefined,
  microphone_prompt_shown: undefined,
  microphone_permission_granted: undefined,
  microphone_permission_denied: undefined,
  first_recording_started: undefined,
  first_recording_sealed: undefined,
  milestone_night_sealed: milestoneSchema,
  milestone_night_missed: milestoneSchema,
  report_setup_viewed: reportSetupSchema,
  report_setup_accepted: reportSetupSchema,
  report_setup_deferred: reportSetupSchema,
  account_started: accountSchema,
  account_completed: accountSchema,
  account_failed: accountSchema,
  processing_permission_accepted: consentSchema,
  processing_permission_withdrawn: consentSchema,
  upload_waiting: uploadWaitingSchema,
  upload_started: uploadSchema,
  upload_completed: uploadSchema,
  upload_failed: uploadSchema,
  checkpoint_report_queued: checkpointSchema,
  checkpoint_report_ready: checkpointSchema,
  checkpoint_report_failed: checkpointSchema,
  checkpoint_report_viewed: checkpointSchema,
  checkpoint_report_listened: checkpointSchema,
  paywall_viewed: paywallSchema,
  plan_selected: planSchema,
  checkout_started: planSchema,
  checkout_cancelled: planSchema,
  checkout_pending: planSchema,
  checkout_store_success: planSchema,
  checkout_server_granted: checkoutGrantSchema,
  checkout_failed: checkoutFailureSchema,
  restore_started: restoreSchema,
  restore_found: restoreFoundSchema,
  restore_not_found: restoreSchema,
  restore_failed: restoreSchema,
  locked_night_8_tapped: undefined,
  purchase_success_screen_viewed: purchaseSchema,
  night_8_opened: purchaseSchema,
};

export const ANALYTICS_EVENT_NAMES = Object.freeze(
  Object.keys(EVENT_SCHEMAS) as AnalyticsEventName[],
);

const SENSITIVE_PROPERTY_FRAGMENTS = [
  'recording',
  'question',
  'transcript',
  'reporttext',
  'emailaddress',
  'userid',
  'ownerid',
  'deviceid',
  'advertisingid',
  'chapterid',
  'nightid',
  'transactionid',
  'content',
  'summary',
  'quote',
  'audiouri',
  'storagepath',
] as const;

function isSensitivePropertyKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized === 'id'
    || normalized === 'email'
    || SENSITIVE_PROPERTY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validatedProperties<Name extends AnalyticsEventName>(
  name: Name,
  input: unknown,
): AnalyticsEventFor<Name>['properties'] {
  const schema = EVENT_SCHEMAS[name];
  if (schema === undefined) {
    if (input !== undefined) throw new AnalyticsValidationError('This analytics event does not accept properties.');
    return Object.freeze({}) as AnalyticsEventFor<Name>['properties'];
  }
  if (!isPlainRecord(input)) throw new AnalyticsValidationError('Analytics properties must be a plain object.');

  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.some((key) => typeof key !== 'string')) {
    throw new AnalyticsValidationError('Analytics properties cannot use symbol keys.');
  }

  const runtimeSchema = schema as Readonly<Record<string, Validator>>;
  const stringKeys = ownKeys as string[];
  for (const key of stringKeys) {
    if (isSensitivePropertyKey(key)) {
      throw new AnalyticsValidationError(`Sensitive analytics property is forbidden: ${key}.`);
    }
    if (!Object.hasOwn(runtimeSchema, key)) {
      throw new AnalyticsValidationError(`Analytics property is not allowlisted: ${key}.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || descriptor.get || descriptor.set) {
      throw new AnalyticsValidationError(`Analytics property must be a plain value: ${key}.`);
    }
    if (!runtimeSchema[key]?.(descriptor.value)) {
      // Never interpolate the rejected value: it may itself be sensitive.
      throw new AnalyticsValidationError(`Analytics property has an invalid value: ${key}.`);
    }
  }

  for (const requiredKey of Object.keys(runtimeSchema)) {
    if (!Object.hasOwn(input, requiredKey)) {
      throw new AnalyticsValidationError(`Analytics property is required: ${requiredKey}.`);
    }
  }

  return Object.freeze({ ...input }) as AnalyticsEventFor<Name>['properties'];
}

function ephemeralSessionId(): AnalyticsSessionId {
  const bytes = new Uint8Array(16);
  const cryptoLike = (globalThis as typeof globalThis & {
    crypto?: { getRandomValues?: (target: Uint8Array) => Uint8Array };
  }).crypto;
  if (typeof cryptoLike?.getRandomValues === 'function') {
    cryptoLike.getRandomValues(bytes);
  } else {
    // This token is correlation-only, never authentication or identity. The
    // fallback supports runtimes without Web Crypto and remains process-local.
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `session_${token}`;
}

export function createAnalytics(): AnalyticsClient {
  const subscribers = new Set<AnalyticsSubscriber>();
  let sessionId = ephemeralSessionId();
  let sequence = 0;

  const track = (<Name extends AnalyticsEventName>(
    name: Name,
    ...args: TrackArguments<Name>
  ): AnalyticsEventFor<Name> => {
    if (!Object.hasOwn(EVENT_SCHEMAS, name)) throw new AnalyticsValidationError('Unknown analytics event.');
    const properties = validatedProperties(name, args[0]);
    sequence += 1;
    const event = Object.freeze({
      name,
      occurredAt: new Date().toISOString(),
      sessionId,
      sequence,
      properties,
    }) as AnalyticsEventFor<Name>;

    // Analytics must never interrupt the product if a future adapter fails.
    for (const subscriber of subscribers) {
      try {
        subscriber(event as AnalyticsEvent);
      } catch {
        // Deliberately ignored. Provider retry/persistence belongs in an adapter.
      }
    }
    return event;
  }) as AnalyticsClient['track'];

  return {
    get sessionId() { return sessionId; },
    track,
    subscribe(subscriber) {
      if (typeof subscriber !== 'function') throw new TypeError('Analytics subscriber must be a function.');
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    startSession() {
      sessionId = ephemeralSessionId();
      sequence = 0;
      return sessionId;
    },
  };
}

/** Provider-neutral singleton. It does not log, persist, or transmit by itself. */
export const analytics = createAnalytics();
export const trackAnalyticsEvent: AnalyticsClient['track'] = analytics.track;
