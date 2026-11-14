const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Watch the workspace root so @kootha/shared resolves even when Metro is
// rooted at this app (EXPO_NO_METRO_WORKSPACE_ROOT=1, needed for local
// Windows release builds).
const workspaceRoot = path.resolve(__dirname, "../..");
config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));

module.exports = config;
