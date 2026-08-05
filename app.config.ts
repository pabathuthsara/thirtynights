import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppEnvironment = 'development' | 'staging' | 'production';

function resolveAppEnvironment(value?: string): AppEnvironment {
  if (!value || value === 'development') return 'development';
  if (value === 'preview' || value === 'staging') return 'staging';
  if (value === 'production') return 'production';
  throw new Error(`Unsupported EXPO_PUBLIC_APP_ENV: ${value}`);
}

function identifiersForEnvironment(environment: AppEnvironment) {
  if (environment === 'production') {
    return { appName: 'Thirty Nights', bundleIdentifier: 'com.thirtynights.app', scheme: 'thirtynights' };
  }
  const suffix = environment === 'staging' ? 'staging' : 'dev';
  const label = environment === 'staging' ? 'Staging' : 'Dev';
  return {
    appName: `Thirty Nights ${label}`,
    bundleIdentifier: `com.thirtynights.app.${suffix}`,
    scheme: `thirtynights-${suffix}`,
  };
}

function buildEnvironment() {
  const profile = process.env.EAS_BUILD_PROFILE;
  const requested = process.env.EXPO_PUBLIC_APP_ENV ?? (
    profile === 'production' ? 'production' : profile === 'preview' ? 'staging' : 'development'
  );
  if (profile && profile !== 'development' && !process.env.EXPO_PUBLIC_APP_ENV) {
    throw new Error(`EXPO_PUBLIC_APP_ENV must be set in the ${profile} EAS environment.`);
  }
  return resolveAppEnvironment(requested);
}

function assertProductionConfiguration() {
  const required = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
    'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
    'EXPO_PUBLIC_NIGHTS_30_PRODUCT_ID',
    'EXPO_PUBLIC_NIGHTS_90_PRODUCT_ID',
    'EXPO_PUBLIC_PRIVACY_URL',
    'EXPO_PUBLIC_TERMS_URL',
    'EXPO_PUBLIC_SUPPORT_URL',
    'EXPO_PUBLIC_DELETE_ACCOUNT_URL',
  ] as const;
  const invalid = required.filter((name) => {
    const value = process.env[name];
    return !value || value.includes('replace_me') || value.includes('example.com');
  });
  if (invalid.length) throw new Error(`Production configuration is missing real values for: ${invalid.join(', ')}`);

  for (const name of ['EXPO_PUBLIC_PRIVACY_URL', 'EXPO_PUBLIC_TERMS_URL', 'EXPO_PUBLIC_SUPPORT_URL', 'EXPO_PUBLIC_DELETE_ACCOUNT_URL'] as const) {
    if (!process.env[name]!.startsWith('https://')) throw new Error(`${name} must use HTTPS in production.`);
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment = buildEnvironment();
  if (environment === 'production') assertProductionConfiguration();
  const identifiers = identifiersForEnvironment(environment);

  return {
    ...config,
    name: identifiers.appName,
    slug: 'thirtynights',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: identifiers.scheme,
    // The palette is a warm light theme. Forcing 'dark' made every native
    // surface the app does not draw (keyboard, switches, system dialogs, the
    // Android navigation bar) render dark inside a cream app.
    userInterfaceStyle: 'light',
    icon: './assets/app/icon.png',
    backgroundColor: '#F8EFE7',
    ios: {
      supportsTablet: false,
      usesAppleSignIn: true,
      bundleIdentifier: identifiers.bundleIdentifier,
      infoPlist: { UIBackgroundModes: [] },
    },
    android: {
      package: identifiers.bundleIdentifier,
      predictiveBackGestureEnabled: false,
      permissions: ['RECORD_AUDIO', 'VIBRATE'],
      adaptiveIcon: {
        foregroundImage: './assets/app/adaptive-icon.png',
        backgroundColor: '#F8EFE7',
      },
    },
    web: { bundler: 'metro', output: 'single', favicon: './assets/app/favicon.png' },
    plugins: [
      // Without this the app cold-started on a white splash and then flashed
      // into the cream UI.
      ['expo-splash-screen', {
        image: './assets/app/splash-icon.png',
        imageWidth: 190,
        resizeMode: 'contain',
        backgroundColor: '#F8EFE7',
      }],
      ['expo-audio', { microphonePermission: 'Thirty Nights uses the microphone only while you hold the record button.' }],
      ['expo-notifications', { sounds: [] }],
      'expo-font',
      'expo-asset',
      'expo-secure-store',
      'expo-sqlite',
      'expo-apple-authentication',
      'expo-sharing',
      'expo-localization',
      'expo-web-browser',
      'expo-system-ui',
    ],
    extra: { ...config.extra, appEnvironment: environment },
  };
};
