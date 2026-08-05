import { describe, expect, it } from 'vitest';

import { identifiersForEnvironment, resolveAppEnvironment } from '@/config/environment';

describe('build environments', () => {
  it('keeps development installs separate from production', () => {
    expect(identifiersForEnvironment('development')).toMatchObject({
      bundleIdentifier: 'com.thirtynights.app.dev',
      scheme: 'thirtynights-dev',
    });
  });

  it('maps the EAS preview name to the staging identity', () => {
    expect(resolveAppEnvironment('preview')).toBe('staging');
    expect(identifiersForEnvironment('staging')).toMatchObject({
      bundleIdentifier: 'com.thirtynights.app.staging',
      scheme: 'thirtynights-staging',
    });
  });

  it('uses the canonical identifiers only for production', () => {
    expect(identifiersForEnvironment('production')).toMatchObject({
      appName: 'Thirty Nights',
      bundleIdentifier: 'com.thirtynights.app',
      scheme: 'thirtynights',
    });
  });

  it('fails closed for an unknown environment', () => {
    expect(() => resolveAppEnvironment('prod')).toThrow('Unsupported EXPO_PUBLIC_APP_ENV');
  });
});
