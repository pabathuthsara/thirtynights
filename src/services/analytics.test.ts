import { describe, expect, it, vi } from 'vitest';

import {
  ANALYTICS_EVENT_NAMES,
  AnalyticsValidationError,
  createAnalytics,
  type AnalyticsClient,
} from '@/services/analytics';

type UnsafeTrack = (name: string, properties?: unknown) => unknown;

describe('privacy-safe analytics', () => {
  it('emits only allowlisted, typed funnel events with safe session metadata', () => {
    const client = createAnalytics();
    const received = vi.fn();
    client.subscribe(received);

    const event = client.track('paywall_viewed', {
      source: 'night7_report',
      variant: 'direct_30',
    });

    expect(ANALYTICS_EVENT_NAMES).toContain('paywall_viewed');
    expect(event).toMatchObject({
      name: 'paywall_viewed',
      sessionId: client.sessionId,
      sequence: 1,
      properties: { source: 'night7_report', variant: 'direct_30' },
    });
    expect(event.sessionId).toMatch(/^session_[a-f0-9]{32}$/);
    expect(new Date(event.occurredAt).toISOString()).toBe(event.occurredAt);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.properties)).toBe(true);
    expect(received).toHaveBeenCalledWith(event);
  });

  it('uses process-local sessions and resets the non-identifying sequence', () => {
    const client = createAnalytics();
    const firstSession = client.sessionId;

    expect(client.track('app_first_opened').sequence).toBe(1);
    expect(client.track('microphone_primer_shown').sequence).toBe(2);

    const nextSession = client.startSession();
    expect(nextSession).not.toBe(firstSession);
    expect(nextSession).toMatch(/^session_[a-f0-9]{32}$/);
    expect(client.track('microphone_prompt_shown')).toMatchObject({
      sessionId: nextSession,
      sequence: 1,
      properties: {},
    });
  });

  it('isolates subscriber failures and supports unsubscribe without retaining events', () => {
    const client = createAnalytics();
    const healthy = vi.fn();
    client.subscribe(() => { throw new Error('provider unavailable'); });
    const unsubscribe = client.subscribe(healthy);

    expect(() => client.track('first_recording_started')).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
    unsubscribe();
    client.track('first_recording_sealed');
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it.each([
    'recording',
    'questionText',
    'transcript',
    'report_text',
    'email',
    'userId',
    'chapter_id',
  ])('rejects sensitive property key %s at runtime', (sensitiveKey) => {
    const unsafeTrack = createAnalytics().track as UnsafeTrack;
    const payload = {
      source: 'night7_report',
      variant: 'direct_30',
      [sensitiveKey]: 'must never leave the app',
    };

    expect(() => unsafeTrack('paywall_viewed', payload)).toThrow(AnalyticsValidationError);
  });

  it('rejects unknown events, unexpected fields, and properties on content-free events', () => {
    const unsafeTrack = createAnalytics().track as UnsafeTrack;

    expect(() => unsafeTrack('custom_event', {})).toThrow('Unknown analytics event');
    expect(() => unsafeTrack('paywall_viewed', {
      source: 'night7_report',
      variant: 'direct_30',
      campaign: 'free-form attribution',
    })).toThrow('not allowlisted');
    expect(() => unsafeTrack('first_recording_started', { itemCount: 1 })).toThrow('does not accept properties');
  });

  it('rejects free-form strings and unsafe numeric values without echoing their content', () => {
    const unsafeTrack = createAnalytics().track as UnsafeTrack;
    const privateValue = 'person@example.com';

    let error: unknown;
    try {
      unsafeTrack('account_started', { method: privateValue });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AnalyticsValidationError);
    expect((error as Error).message).not.toContain(privateValue);
    expect(() => unsafeTrack('processing_permission_accepted', {
      disclosureVersion: 'provider-specific prose',
    })).toThrow(AnalyticsValidationError);
    expect(() => unsafeTrack('upload_completed', { itemCount: 91 })).toThrow(AnalyticsValidationError);
    expect(() => unsafeTrack('checkout_server_granted', {
      plan: 'paid30',
      source: 'night7_report',
      grantLatencyMs: Number.NaN,
    })).toThrow(AnalyticsValidationError);
  });

  it('accepts fixed dimensions and counts needed by the audit measurement plan', () => {
    const client = createAnalytics();

    expect(client.track('onboarding_completed', { step: 'reminder', version: 2 }).properties).toEqual({ step: 'reminder', version: 2 });
    expect(client.track('milestone_night_sealed', { night: 7 }).properties).toEqual({ night: 7 });
    expect(client.track('upload_waiting', { itemCount: 3, reason: 'network' }).properties).toEqual({ itemCount: 3, reason: 'network' });
    expect(client.track('checkpoint_report_ready', { checkpoint: 7 }).properties).toEqual({ checkpoint: 7 });
    expect(client.track('checkout_server_granted', {
      plan: 'paid30',
      source: 'night7_report',
      grantLatencyMs: 1_250,
    }).properties.grantLatencyMs).toBe(1_250);
    expect(client.track('restore_found', { store: 'app_store', plan: 'paid30' }).properties).toEqual({ store: 'app_store', plan: 'paid30' });
  });
});

// These lines are never executed; they make `tsc` verify that callers cannot
// accidentally expand the event or property vocabulary.
if (false) {
  const client = createAnalytics();
  // @ts-expect-error arbitrary event names are not accepted
  client.track('custom_event');
  // @ts-expect-error sensitive/free-form properties are not accepted
  client.track('account_started', { method: 'email', email: 'person@example.com' });
  // @ts-expect-error content-free events accept no payload
  client.track('first_recording_started', { question: 'private prompt' });
  // @ts-expect-error subscribers receive the discriminated analytics union
  const invalidClient: AnalyticsClient = { track: () => undefined };
  void invalidClient;
}
