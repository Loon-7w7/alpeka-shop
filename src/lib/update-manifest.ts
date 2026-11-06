export type UpdateManifest = {
  version: string;
  url: string;
  sha256?: string;
  notes?: string;
};

export function parseManifest(value: unknown): UpdateManifest | null {
  if (typeof value !== 'object' || value === null) return null;
  const { version, url, sha256, notes } = value as Record<string, unknown>;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  if (sha256 !== undefined && (typeof sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(sha256))) return null;
  return {
    version,
    url,
    sha256: sha256?.toLowerCase(),
    notes: typeof notes === 'string' ? notes.slice(0, 300) : undefined,
  };
}

export function isNewerVersion(remote: string, local: string): boolean {
  const a = remote.split('.').map(Number);
  const b = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
