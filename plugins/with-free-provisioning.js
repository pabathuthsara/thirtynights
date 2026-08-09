const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Removes the entitlements a free Apple ID cannot sign.
 *
 * A Personal Team cannot provision Push Notifications or Sign in with Apple,
 * and Xcode fails the build outright rather than dropping them. Enabled by
 * setting EXPO_FREE_PROVISIONING=1; see `usesFreeProvisioning` in
 * app.config.ts, which also refuses to let it reach a production build.
 *
 * This exists as a plugin module rather than as configuration because neither
 * of the obvious approaches works:
 *
 * - Omitting the plugins from `plugins` does nothing. expo-notifications and
 *   expo-apple-authentication both ship an `app.plugin.js`, so Expo autolinks
 *   them from package.json however the array is written.
 * - `usesAppleSignIn: false` does not remove the Apple entitlement, because
 *   expo-apple-authentication's plugin sets it unconditionally.
 *
 * So the entitlements have to be deleted after every other plugin has run.
 * Expo runs mods in reverse registration order, so that means listing this
 * plugin FIRST in `plugins`, not last. Prebuild is also incremental —
 * `withEntitlementsPlist` merges into whatever file is already on disk — so it
 * deletes on every run rather than assuming a clean slate.
 *
 * Nothing needed for device testing is lost. The app's reminders are local
 * notifications, which never required `aps-environment`, and `lib/supabase`
 * gates every Apple call on `isAvailableAsync()`, so sign-in degrades to the
 * email path instead of crashing.
 */
module.exports = function withFreeProvisioning(config) {
  return withEntitlementsPlist(config, (entitlements) => {
    delete entitlements.modResults['aps-environment'];
    delete entitlements.modResults['com.apple.developer.applesignin'];
    return entitlements;
  });
};
