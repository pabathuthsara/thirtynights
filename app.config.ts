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
    // Bundle identifiers are globally unique across all Apple developer teams,
    // and `com.thirtynights.app.dev` is already registered to someone else — a
    // free Personal Team cannot claim it, so Xcode refuses to make a profile.
    // EXPO_DEV_BUNDLE_ID overrides it locally for side-loading. It deliberately
    // does not apply to staging or production, whose identifiers are fixed by
    // the App Store record.
    bundleIdentifier: environment === 'development' && process.env.EXPO_DEV_BUNDLE_ID
      ? process.env.EXPO_DEV_BUNDLE_ID
      : `com.thirtynights.app.${suffix}`,
    // The deep-link scheme is unchanged: it is matched by Supabase's redirect
    // allowlist, not by Apple, so it must stay `thirtynights-dev`.
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

/**
 * v1 launches on the App Store only, so demanding a Play-side RevenueCat key
 * would block the iOS build on a credential that does not exist yet. Require
 * the key for the platform actually being built; EAS sets EAS_BUILD_PLATFORM,
 * and a local production export (no platform set) is checked against iOS.
 */
function requiredStoreKeys() {
  return process.env.EAS_BUILD_PLATFORM === 'android'
    ? (['EXPO_PUBLIC_REVENUECAT_ANDROID_KEY'] as const)
    : (['EXPO_PUBLIC_REVENUECAT_IOS_KEY'] as const);
}

/**
 * A free Apple ID signs through a Personal Team, which cannot provision the
 * Sign in with Apple or Push Notifications entitlements — Xcode refuses the
 * build outright rather than dropping them. Setting EXPO_FREE_PROVISIONING=1
 * in a local .env omits both so the app can be side-loaded onto a device for
 * UI and recording testing before Developer Program enrolment completes.
 *
 * Local reminders are unaffected: they are app-owned local notifications and
 * never needed `aps-environment`. Apple sign-in degrades rather than crashes,
 * because `lib/supabase` gates every call on `isAvailableAsync()`.
 */
function usesFreeProvisioning() {
  return process.env.EXPO_FREE_PROVISIONING === '1';
}

function assertProductionConfiguration() {
  if (usesFreeProvisioning()) {
    throw new Error('EXPO_FREE_PROVISIONING is a local development-signing escape hatch and must never be set for a production build.');
  }
  const required = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ...requiredStoreKeys(),
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

  // The RevenueCat webhook maps these exact permanent product identifiers to
  // server-authoritative grants. Refuse a production build that could charge
  // for an identifier the ledger would ignore.
  const expectedProducts = {
    EXPO_PUBLIC_NIGHTS_30_PRODUCT_ID: 'com.thirtynights.nights30',
    EXPO_PUBLIC_NIGHTS_90_PRODUCT_ID: 'com.thirtynights.nights90',
  } as const;
  for (const [name, expected] of Object.entries(expectedProducts)) {
    if (process.env[name] !== expected) throw new Error(`${name} must be ${expected} to match the production purchase ledger.`);
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
      // v1 ships phone-only. The layouts have never had deliberate iPad QA, and
      // declaring tablet support means App Review runs the whole thing on an
      // iPad and rejects what it finds there.
      supportsTablet: false,
      usesAppleSignIn: !usesFreeProvisioning(),
      bundleIdentifier: identifiers.bundleIdentifier,
      infoPlist: {
        UIBackgroundModes: [],
        // Declared up front so every TestFlight and App Store upload stops
        // stalling on the export-compliance question. The app uses only the
        // HTTPS/TLS exemption, so this is the correct answer.
        ITSAppUsesNonExemptEncryption: false,
      },
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
      // Deliberately first: mods run in reverse registration order, so the
      // earliest-listed plugin is the last to touch the entitlements file.
      // Listing this last made it run before anything had written them.
      ...(usesFreeProvisioning() ? ['./plugins/with-free-provisioning'] : []),
      // Without this the app cold-started on a white splash and then flashed
      // into the cream UI.
      ['expo-splash-screen', {
        image: './assets/app/splash-icon.png',
        imageWidth: 190,
        resizeMode: 'contain',
        backgroundColor: '#F8EFE7',
      }],
      ['expo-audio', { microphonePermission: 'Thirty Nights uses the microphone only while you record a nightly answer.' }],
      // Android draws the small icon as a mask: anything with real colour in it
      // arrives as a grey blob. `notification-icon.png` is a white silhouette on
      // transparent (see scripts/make_notification_icon.py), tinted at runtime
      // with the app's brass.
      ['expo-notifications', {
        icon: './assets/app/notification-icon.png',
        color: '#B88635',
        sounds: [],
      }],
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
