// The app sits inside the Clipiro repo but is NOT an npm workspace member:
// the web app at the repo root pins its own dependencies and must not install
// Expo's on Hostinger. Metro is told about exactly one outside folder —
// packages/shared — and anything that folder imports is resolved from THIS
// app's node_modules, never the web app's (one React, one React Native).
const path = require("path");
// Sentry's version of Expo's default config: it adds debug ids so crash
// reports map back to the source (mobile Phase 15).
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "../../packages/shared");

const config = getSentryExpoConfig(projectRoot);

config.watchFolders = [sharedRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

// Normal hierarchical lookup stays on (packages ship nested deps, e.g.
// reanimated's own semver). Only requests made from packages/shared are
// re-rooted here, so walking up from it can never reach <repo>/node_modules.
const anchor = path.join(projectRoot, "package.json");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (context.originModulePath.startsWith(sharedRoot + path.sep) && !moduleName.startsWith(".")) {
    return context.resolveRequest({ ...context, originModulePath: anchor }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
