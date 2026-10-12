// Adds the build-specific bits to app.json. All are optional, so a build
// without them still works (that feature just stays off):
//  - google-services.json (Firebase, for Android push via FCM): put the file
//    next to this one, or point GOOGLE_SERVICES_JSON at it (an EAS file env var).
//  - EAS_PROJECT_ID: the Expo project the push tokens and EAS Update belong to.
//  - SENTRY_ORG + SENTRY_PROJECT: upload source maps to Sentry during the
//    build (with SENTRY_AUTH_TOKEN as an EAS secret). Crash reports
//    themselves need only EXPO_PUBLIC_SENTRY_DSN (src/lib/sentry.ts).
// docs/mobile/RELEASE.md lists where each one is set.
const fs = require("fs");

module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync("./google-services.json") ? "./google-services.json" : undefined);
  const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;
  const sentry =
    process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
      ? [["@sentry/react-native/expo", { url: process.env.SENTRY_URL || "https://sentry.io/", organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }]]
      : [];
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    plugins: [...(config.plugins ?? []), ...sentry],
    // EAS Update: JS-only fixes reach installed builds with the same runtime
    // version (app.json runtimeVersion: the native fingerprint).
    ...(projectId ? { updates: { ...config.updates, url: `https://u.expo.dev/${projectId}` } } : {}),
    extra: { ...config.extra, ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}) },
  };
};
