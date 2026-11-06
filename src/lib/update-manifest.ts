export type UpdateManifest = {
  version: string;
  url: string;
  sha256: string;
  notes?: string;
};

/**
 * El APK solo puede venir de un Release de GitHub con la misma versión, y siempre con su SHA-256.
 * Sin hash no se instala nada.
 */
export function parseManifest(value: unknown): UpdateManifest | null {
  if (typeof value !== 'object' || value === null) return null;
  const { version, url, sha256, notes } = value as Record<string, unknown>;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (typeof url !== 'string' || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\//.test(url)) return null;
  if (!url.includes(`/releases/download/v${version}/`)) return null;
  if (typeof sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(sha256)) return null;
  return {
    version,
    url,
    sha256: sha256.toLowerCase(),
    notes: typeof notes === 'string' ? notes.slice(0, 300) : undefined,
  };
}

const parts = (version: string) => version.split('.').map((part) => parseInt(part, 10) || 0);

/** Compara "1.10.0" con "1.9.9". Lo que no sea número cuenta como 0, así "1.0.0-rc1" equivale a 1.0.0. */
export function isNewerVersion(remote: string, local: string): boolean {
  const a = parts(remote);
  const b = parts(local);
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
