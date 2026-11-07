import type { SqlDb } from './types.ts';

/** Agrega siempre al final. Nunca edites una migración que ya se instaló en un teléfono. */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE products (
     code        TEXT PRIMARY KEY NOT NULL,
     name        TEXT NOT NULL,
     name_search TEXT NOT NULL,
     price_cents INTEGER NOT NULL CHECK (price_cents > 0),
     created_at  TEXT NOT NULL,
     updated_at  TEXT NOT NULL
   ) WITHOUT ROWID;
   CREATE INDEX idx_products_name_search ON products (name_search);
   CREATE TABLE settings (
     key   TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL
   ) WITHOUT ROWID;`,
  // Una promoción por producto. `rule` es JSON (ver `lib/promo.ts`); `active` 1 = se aplica al cobrar.
  `CREATE TABLE promotions (
     code       TEXT PRIMARY KEY NOT NULL,
     rule       TEXT NOT NULL,
     active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   ) WITHOUT ROWID;`,
];

export async function migrate(db: SqlDb): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;
  for (let index = current; index < MIGRATIONS.length; index++) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(MIGRATIONS[index]);
      await txn.execAsync(`PRAGMA user_version = ${index + 1};`);
    });
  }
}
