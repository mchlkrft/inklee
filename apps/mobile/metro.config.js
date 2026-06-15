// Expo + pnpm monorepo Metro config.
// Watches the workspace root so `@inklee/shared` (raw TS source) resolves, and
// pins module resolution to the hoisted root node_modules (node-linker=hoisted).
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// REQUIRED in this pnpm monorepo: confine resolution to nodeModulesPaths only.
// Without it, Metro's hierarchical walk pulls a SECOND copy of React — e.g.
// react-native-safe-area-context -> use-sync-external-store/node_modules/react
// (19.2.4, hoisted for the web app) clashes with the app's React 19.1.0, which
// surfaces on-device as "Invalid hook call / Cannot read property 'useRef' of
// null". Pinning to the explicit paths makes every package resolve the single
// root React 19.1.0. (Package exports is on by default in SDK 54's Metro.)
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: "./global.css" });
