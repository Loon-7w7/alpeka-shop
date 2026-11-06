const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// El navegador solo sirve para revisar la interfaz: en web se usan estos sustitutos. El APK no los incluye.
const webShims = {
  'expo-sqlite': path.join(__dirname, 'tests/web/sqlite-shim.tsx'),
  'expo-router/native-tabs': path.join(__dirname, 'tests/web/native-tabs-shim.tsx'),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && webShims[moduleName]) return { type: 'sourceFile', filePath: webShims[moduleName] };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
