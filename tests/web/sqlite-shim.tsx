// Solo para ver y probar la interfaz en el navegador (npm run web). El APK usa SQLite real.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { SqlDb, SqlValue } from '../../src/db/types';
import { toSearchText } from '../../src/lib/text';

type Row = Record<string, string | number>;
const KEY = 'alpeka-web-preview';
const load = (): { products: Row[]; settings: Row[] } => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '') as { products: Row[]; settings: Row[] };
  } catch {
    return { products: [], settings: [] };
  }
};
const store = load();
const persist = () => localStorage.setItem(KEY, JSON.stringify(store));

const db: SqlDb = {
  execAsync: async () => undefined,
  withExclusiveTransactionAsync: async (task) => task(db),
  getFirstAsync: async <T,>(sql: string, p: SqlValue[]) => {
    if (sql.startsWith('PRAGMA')) return { user_version: 1 } as T;
    if (sql.includes('COUNT(*)')) return { total: store.products.length } as T;
    if (sql.includes('FROM settings')) return (store.settings.find((s) => s.key === p[0]) ?? null) as T | null;
    return (store.products.find((r) => r.code === p[0]) ?? null) as T | null;
  },
  getAllAsync: async <T,>(sql: string, p: SqlValue[]) => {
    const sorted = [...store.products].sort((a, b) => String(a.name_search).localeCompare(String(b.name_search)));
    if (!sql.includes('LIKE')) return sorted as T[];
    const term = String(p[0]).replace(/%/g, '').replace(/\\/g, '');
    const code = String(p[1]).replace(/%/g, '').replace(/\\/g, '');
    return sorted.filter((r) => String(r.name_search).includes(term) || String(r.code).includes(code)) as T[];
  },
  runAsync: async (sql, p) => {
    if (sql.includes('INTO settings')) {
      store.settings = store.settings.filter((s) => s.key !== p[0]).concat({ key: String(p[0]), value: String(p[1]) });
    } else if (sql.startsWith('INSERT')) {
      store.products.push({ code: p[0]!, name: p[1]!, name_search: toSearchText(String(p[1])), price_cents: p[3]!, created_at: p[4]!, updated_at: p[5]! });
    } else if (sql.startsWith('UPDATE')) {
      const row = store.products.find((r) => r.code === p[5]);
      if (row) Object.assign(row, { code: p[0], name: p[1], name_search: p[2], price_cents: p[3], updated_at: p[4] });
    } else if (sql.includes('WHERE code')) {
      store.products = store.products.filter((r) => r.code !== p[0]);
    } else {
      store.products = [];
    }
    persist();
    return { changes: 1 };
  },
};

const Context = createContext(db);
export const useSQLiteContext = () => useContext(Context);
export function SQLiteProvider({ children, onInit }: { children: ReactNode; databaseName: string; onInit?: (database: SqlDb) => Promise<void> }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (onInit?.(db) ?? Promise.resolve()).then(() => setReady(true));
  }, [onInit]);
  return ready ? children : null;
}
