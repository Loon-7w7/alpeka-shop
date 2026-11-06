import type { SqlDb } from './types.ts';

/**
 * `cart`: la cuenta en curso del cajero (ver `lib/cart.ts`).
 * `theme_color` / `theme_mode`: apariencia elegida en Ajustes (ver `theme/palettes.ts`).
 * Ninguna forma parte de los respaldos.
 */
export type SettingKey = 'welcome_seen' | 'last_backup_at' | 'cart' | 'theme_color' | 'theme_mode';

export async function getSetting(db: SqlDb, key: SettingKey): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(db: SqlDb, key: SettingKey, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}
