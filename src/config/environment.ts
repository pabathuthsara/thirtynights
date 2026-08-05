export type AppEnvironment = 'development' | 'staging' | 'production';

export function resolveAppEnvironment(value?: string): AppEnvironment {
  if (!value || value === 'development') return 'development';
  if (value === 'preview' || value === 'staging') return 'staging';
  if (value === 'production') return 'production';
  throw new Error(`Unsupported EXPO_PUBLIC_APP_ENV: ${value}`);
}

export function identifiersForEnvironment(environment: AppEnvironment) {
  if (environment === 'production') {
    return {
      appName: 'Thirty Nights',
      bundleIdentifier: 'com.thirtynights.app',
      scheme: 'thirtynights',
    };
  }
  const suffix = environment === 'staging' ? 'staging' : 'dev';
  const label = environment === 'staging' ? 'Staging' : 'Dev';
  return {
    appName: `Thirty Nights ${label}`,
    bundleIdentifier: `com.thirtynights.app.${suffix}`,
    scheme: `thirtynights-${suffix}`,
  };
}

export const appEnvironment = resolveAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV);
export const appIdentifiers = identifiersForEnvironment(appEnvironment);
