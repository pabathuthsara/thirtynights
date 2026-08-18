import { describe, expect, it } from 'vitest';

import { processingConsentError } from '@/lib/supabaseErrors';

describe('processingConsentError', () => {
  it('explains when the consent RPC has not been deployed', () => {
    const error = processingConsentError({
      code: 'PGRST202',
      message: 'Could not find the function public.set_processing_consent(requested_version) in the schema cache',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('cloud service needs an update');
  });

  it('recognizes a missing RPC even when a client library uses an Error subclass', () => {
    const error = Object.assign(new Error('Function is missing from the schema cache'), {
      code: 'PGRST202',
    });

    expect(processingConsentError(error).message).toContain('cloud service needs an update');
  });

  it('turns a permanent-account rejection into a reconnect action', () => {
    expect(processingConsentError({ code: '42501', message: 'permanent account required' }).message)
      .toBe('Reconnect your recoverable account, then try again.');
  });

  it('preserves other Supabase messages', () => {
    expect(processingConsentError({ code: '57014', message: 'Request timed out' }).message)
      .toBe('Request timed out');
  });

  it('preserves native errors', () => {
    const original = new Error('Network request failed');
    expect(processingConsentError(original)).toBe(original);
  });
});
