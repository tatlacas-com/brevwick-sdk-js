// Expo Metro config tuned for the pnpm monorepo.
//
// `watchFolders` points Metro at the workspace root so it can resolve the
// `workspace:*` link to `@tatlacas/brevwick-react-native` (and its peer,
// `@tatlacas/brevwick-sdk`). Metro defaults to walking only the project
// directory's `node_modules`, which under pnpm only contains a symlink — the
// real files live under the root `node_modules/.pnpm/` store.
//
// `disableHierarchicalLookup` + an explicit `nodeModulesPaths` whitelist
// is required to keep Metro from walking up out of the example and
// finding `react-native@0.76.9` in the SDK package's own `node_modules`
// (the SDK declares 0.76.9 as a peer/dev). The example pins
// `react-native@0.74.5` and Metro must resolve that one. The cost is
// that Expo's transitive deps (`expo-modules-core`, etc.) cannot be
// reached via `node_modules` traversal — they must be listed as direct
// deps of this example so pnpm symlinks them into
// `examples/react-native/node_modules/`, where the whitelist sees them.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
