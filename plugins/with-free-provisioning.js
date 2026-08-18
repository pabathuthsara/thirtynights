const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Removes the entitlements a free Apple ID cannot sign.
 *
 * A Personal Team cannot provision Push Notifications, and Xcode fails the
 * build outright rather than dropping it. Enabled by setting
 * EXPO_FREE_PROVISIONING=1; see `usesFreeProvisioning` in app.config.ts, which
 * also refuses to let it reach a production build.
 *
 * This exists as a plugin module rather than as configuration because neither
 * of the obvious approaches works:
 *
 * The entitlement has to be deleted after expo-notifications has run.
 * Expo runs mods in reverse registration order, so that means listing this
 * plugin FIRST in `plugins`, not last. Prebuild is also incremental —
 * `withEntitlementsPlist` merges into whatever file is already on disk — so it
 * deletes on every run rather than assuming a clean slate.
 *
 * Nothing needed for device testing is lost. The app's reminders are local
 * notifications, which never required `aps-environment`. The stale Apple
 * entitlement is also removed defensively from prebuilds created before social
 * sign-in was removed.
 */
module.exports = function withFreeProvisioning(config) {
  return withEntitlementsPlist(config, (entitlements) => {
    delete entitlements.modResults['aps-environment'];
    delete entitlements.modResults['com.apple.developer.applesignin'];
    return entitlements;
  });
};
