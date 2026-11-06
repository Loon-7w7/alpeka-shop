import { routeForIncoming } from '@/lib/incoming-file';

/** Expo Router llama esto con cada dirección que abre la app, incluso los archivos que se abren desde otras apps. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return routeForIncoming(path);
  } catch {
    // Si algo raro llega, mejor abrir la app normal que mostrar un error.
    return '/';
  }
}
