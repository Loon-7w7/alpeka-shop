export const UPDATE_MANIFEST_URL = process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL ?? '';

export const updatesConfigured = () =>
  UPDATE_MANIFEST_URL.startsWith('https://') && !UPDATE_MANIFEST_URL.includes('TU_USUARIO');
