// El enlace es público. Se deja también aquí porque los bundles de EAS Update no reciben el `env` de eas.json.
const DEFAULT_MANIFEST_URL = 'https://github.com/Loon-7w7/alpeka-shop/releases/latest/download/version.json';

export const UPDATE_MANIFEST_URL = process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL || DEFAULT_MANIFEST_URL;

export const updatesConfigured = () =>
  UPDATE_MANIFEST_URL.startsWith('https://') && !UPDATE_MANIFEST_URL.includes('TU_USUARIO');
