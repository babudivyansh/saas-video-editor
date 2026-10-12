// Adds the build-specific bits to app.json. Both are optional so a build
// without them still works; push notifications just stay off:
//  - google-services.json (Firebase, for Android push via FCM): put the file
//    next to this one, or point GOOGLE_SERVICES_JSON at it (an EAS file env var).
//  - EAS_PROJECT_ID: the Expo project the push tokens belong to.
const fs = require("fs");

module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync("./google-services.json") ? "./google-services.json" : undefined);
  const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    extra: { ...config.extra, ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}) },
  };
};
