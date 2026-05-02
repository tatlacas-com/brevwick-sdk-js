// Expo Metro config tuned for the pnpm monorepo.
//
// `watchFolders` points Metro at the workspace root so it can resolve the
// `workspace:*` link to `@tatlacas/brevwick-react-native` (and its peer,
// `@tatlacas/brevwick-sdk`). Metro defaults to walking only the project
// directory's `node_modules`, which under pnpm only contains a symlink — the
// real files live under the root `node_modules/.pnpm/` store.
//
// `disableHierarchicalLookup` + an explicit `nodeModulesPaths` whitelist
// avoids the classic "duplicate React" error you get when Metro discovers
// two copies of `react` along the way (the example's own `node_modules` and
// the workspace root's). Both arrays-of-paths are required: the project
// node_modules first, then the workspace root.

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
