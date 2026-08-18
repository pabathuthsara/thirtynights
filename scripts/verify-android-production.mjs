import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const expoCli = join(repositoryRoot, 'node_modules', 'expo', 'bin', 'cli');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'thirtynights-android-production-'));
const stagedProject = join(temporaryRoot, 'project');

const productionEnvironment = {
  ...process.env,
  EXPO_NO_DOTENV: '1',
  EAS_BUILD_PROFILE: 'production',
  EAS_BUILD_PLATFORM: 'android',
  EXPO_PUBLIC_APP_ENV: 'production',
  EXPO_FREE_PROVISIONING: '',
  EXPO_PUBLIC_SUPABASE_URL: 'https://thirtynights-ci.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ci_validation_only',
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: 'goog_ci_validation_only',
  EXPO_PUBLIC_NIGHTS_30_PRODUCT_ID: 'com.thirtynights.nights30',
  EXPO_PUBLIC_NIGHTS_90_PRODUCT_ID: 'com.thirtynights.nights90',
  EXPO_PUBLIC_PRIVACY_URL: 'https://thirtynights.invalid/privacy',
  EXPO_PUBLIC_TERMS_URL: 'https://thirtynights.invalid/terms',
  EXPO_PUBLIC_SUPPORT_URL: 'https://thirtynights.invalid/support',
  EXPO_PUBLIC_DELETE_ACCOUNT_URL: 'https://thirtynights.invalid/delete-account',
};

function runExpo(args, cwd) {
  const result = spawnSync(process.execPath, [expoCli, ...args], {
    cwd,
    env: productionEnvironment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Expo command failed with exit code ${result.status}: expo ${args.join(' ')}`);
  }
}

function assertContains(contents, expected, description) {
  if (!contents.includes(expected)) throw new Error(`Production Android verification failed: ${description}`);
}

function assertOmits(contents, forbidden, description) {
  if (contents.includes(forbidden)) throw new Error(`Production Android verification failed: ${description}`);
}

try {
  const excludedTopLevels = new Set([
    '.expo',
    '.git',
    'android',
    'dist',
    'ios',
    'node_modules',
    'tmp',
    'web-build',
  ]);

  cpSync(repositoryRoot, stagedProject, {
    recursive: true,
    filter(source) {
      const pathFromRoot = relative(repositoryRoot, source);
      if (!pathFromRoot) return true;
      const topLevel = pathFromRoot.split(sep)[0];
      if (topLevel === '.env' || topLevel.startsWith('.env.')) return false;
      return !excludedTopLevels.has(topLevel);
    },
  });
  symlinkSync(join(repositoryRoot, 'node_modules'), join(stagedProject, 'node_modules'), 'dir');

  runExpo(['prebuild', '--platform', 'android', '--no-install', '--clean'], stagedProject);

  const manifest = readFileSync(
    join(stagedProject, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    'utf8',
  );
  const gradle = readFileSync(join(stagedProject, 'android', 'app', 'build.gradle'), 'utf8');

  assertContains(manifest, 'android.permission.RECORD_AUDIO', 'RECORD_AUDIO is missing');
  assertContains(manifest, 'android.permission.VIBRATE', 'VIBRATE is missing');
  assertContains(gradle, 'com.thirtynights.app', 'the production application ID is incorrect');

  const overlayPermissionLine = manifest
    .split('\n')
    .find((line) => line.includes('android.permission.SYSTEM_ALERT_WINDOW'));
  if (!overlayPermissionLine?.includes('tools:node="remove"')) {
    throw new Error(
      'Production Android verification failed: SYSTEM_ALERT_WINDOW must have a manifest removal directive',
    );
  }

  for (const permission of [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  ]) {
    assertOmits(manifest, permission, `${permission} must not be declared`);
  }
  for (const service of [
    'expo.modules.audio.service.AudioControlsService',
    'expo.modules.audio.service.AudioRecordingService',
  ]) {
    assertOmits(manifest, service, `${service} must not be registered`);
  }

  runExpo(
    ['export', '--platform', 'android', '--output-dir', join(repositoryRoot, 'dist', 'android-production')],
    repositoryRoot,
  );
  console.log('Production Android config, native permissions, and bundle export verified.');
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
