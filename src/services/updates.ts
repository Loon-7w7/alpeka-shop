import * as Application from 'expo-application';
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import { UPDATE_MANIFEST_URL, updatesConfigured } from '../config';
import { isNewerVersion, parseManifest, type UpdateManifest } from '../lib/update-manifest.ts';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'upToDate' }
  | { status: 'available'; manifest: UpdateManifest }
  | { status: 'downloading'; manifest: UpdateManifest; progress: number | null }
  | { status: 'error'; message: string; manifest?: UpdateManifest };

const FLAG_GRANT_READ_URI_PERMISSION = 1;

let state: UpdateState = { status: 'idle' };
const listeners = new Set<() => void>();

function setState(next: UpdateState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const getUpdateState = () => state;
export const subscribeToUpdates = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const updatesSupported = () => Platform.OS === 'android' && updatesConfigured();
export const currentVersion = () => Application.nativeApplicationVersion ?? '1.0.0';

/** Con `silent` no muestra errores: abrir la app sin internet no debe molestar al cajero. */
export async function checkForUpdate({ silent = false } = {}): Promise<void> {
  if (!updatesSupported() || state.status === 'checking' || state.status === 'downloading') return;
  setState({ status: 'checking' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(UPDATE_MANIFEST_URL, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = parseManifest(await response.json());
    if (!manifest) throw new Error('version.json inválido');
    setState(isNewerVersion(manifest.version, currentVersion()) ? { status: 'available', manifest } : { status: 'upToDate' });
  } catch {
    setState(silent ? { status: 'idle' } : { status: 'error', message: 'No se pudo revisar. Comprueba tu conexión a internet.' });
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadAndInstall(manifest: UpdateManifest): Promise<void> {
  if (Platform.OS !== 'android' || state.status === 'downloading') return;
  setState({ status: 'downloading', manifest, progress: null });
  try {
    const folder = new Directory(Paths.cache, 'updates');
    if (folder.exists) folder.delete();
    folder.create({ intermediates: true });
    const file = await File.downloadFileAsync(manifest.url, new File(folder, `alpeka-shop-${manifest.version}.apk`), {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) setState({ status: 'downloading', manifest, progress: bytesWritten / totalBytes });
      },
    });
    if (manifest.sha256 && (await file.digest('SHA-256')).toLowerCase() !== manifest.sha256) {
      file.delete();
      throw new Error('checksum');
    }
    setState({ status: 'available', manifest });
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: file.contentUri,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
      type: 'application/vnd.android.package-archive',
    });
  } catch {
    setState({ status: 'error', manifest, message: 'No se pudo instalar la actualización. Inténtalo otra vez.' });
  }
}
