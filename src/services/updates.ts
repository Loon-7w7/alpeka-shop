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
/** Si la descarga no avanza en este tiempo, se da por perdida para que el cajero pueda reintentar. */
const DOWNLOAD_STALL_MS = 45_000;

let state: UpdateState = { status: 'idle' };
const listeners = new Set<() => void>();

function setState(next: UpdateState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function logError(where: string, error: unknown) {
  if (__DEV__) console.warn(`[updates] ${where}`, error);
}

class UpdateStepError extends Error {
  constructor(readonly step: 'network' | 'checksum' | 'install') {
    super(step);
  }
}

const MESSAGES: Record<UpdateStepError['step'], string> = {
  network: 'La descarga se interrumpió. Revisa tu internet e inténtalo otra vez.',
  checksum: 'El archivo descargado no coincide con la versión publicada. No se instaló nada.',
  install: 'No se pudo abrir el instalador de Android. Inténtalo otra vez.',
};

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
    if (!manifest) throw new Error('version.json inválido o sin sha256');
    setState(isNewerVersion(manifest.version, currentVersion()) ? { status: 'available', manifest } : { status: 'upToDate' });
  } catch (error) {
    logError('checkForUpdate', error);
    setState(silent ? { status: 'idle' } : { status: 'error', message: 'No se pudo revisar. Comprueba tu conexión a internet.' });
  } finally {
    clearTimeout(timeout);
  }
}

function downloadWithWatchdog(manifest: UpdateManifest, target: File): Promise<File> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<File>((resolve, reject) => {
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => reject(new UpdateStepError('network')), DOWNLOAD_STALL_MS);
    };
    arm();
    File.downloadFileAsync(manifest.url, target, {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => {
        arm();
        if (totalBytes > 0 && state.status === 'downloading') {
          setState({ status: 'downloading', manifest, progress: bytesWritten / totalBytes });
        }
      },
    }).then(resolve, (error) => {
      logError('download', error);
      reject(new UpdateStepError('network'));
    });
  }).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function downloadAndInstall(manifest: UpdateManifest): Promise<void> {
  if (Platform.OS !== 'android' || state.status === 'downloading') return;
  setState({ status: 'downloading', manifest, progress: null });
  try {
    const folder = new Directory(Paths.cache, 'updates');
    if (folder.exists) folder.delete();
    folder.create({ intermediates: true });
    const file = await downloadWithWatchdog(manifest, new File(folder, `alpeka-shop-${manifest.version}.apk`));
    if ((await file.digest('SHA-256')).toLowerCase() !== manifest.sha256) {
      file.delete();
      throw new UpdateStepError('checksum');
    }
    setState({ status: 'available', manifest });
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: file.contentUri,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
        type: 'application/vnd.android.package-archive',
      });
    } catch (error) {
      logError('install', error);
      throw new UpdateStepError('install');
    }
  } catch (error) {
    logError('downloadAndInstall', error);
    const step = error instanceof UpdateStepError ? error.step : 'network';
    setState({ status: 'error', manifest, message: MESSAGES[step] });
  }
}
