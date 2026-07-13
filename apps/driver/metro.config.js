// Monorepo-aware Metro config: watch the workspace root and resolve deps
// from both the app's and the root's node_modules (npm workspaces hoists most
// deps to the root, and @acting/shared is a symlinked workspace package).
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
// Keep hierarchical lookup ON (Metro default) so nested transitive deps like
// simple-swizzle/node_modules/is-arrayish still resolve.

module.exports = config;
