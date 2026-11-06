import { escapeLike, toSearchText } from '../lib/text.ts';
import type { SqlDb } from './types.ts';

export type Product = {
  code: string;
  name: string;
  priceCents: number;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  code: string;
  name: string;
  price_cents: number;
  created_at: string;
  updated_at: string;
};

const COLUMNS = 'code, name, price_cents, created_at, updated_at';
export const SEARCH_LIMIT = 200;

const toProduct = (row: Row): Product => ({
  code: row.code,
  name: row.name,
  priceCents: row.price_cents,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class DuplicateCodeError extends Error {}

export async function getProduct(db: SqlDb, code: string): Promise<Product | null> {
  const row = await db.getFirstAsync<Row>(`SELECT ${COLUMNS} FROM products WHERE code = ?`, [code]);
  return row ? toProduct(row) : null;
}

export async function searchProducts(db: SqlDb, query: string): Promise<Product[]> {
  const term = toSearchText(query);
  const rows = term
    ? await db.getAllAsync<Row>(
        `SELECT ${COLUMNS} FROM products
         WHERE name_search LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\'
         ORDER BY name_search LIMIT ?`,
        [`%${escapeLike(term)}%`, `%${escapeLike(query.trim().toUpperCase())}%`, SEARCH_LIMIT],
      )
    : await db.getAllAsync<Row>(`SELECT ${COLUMNS} FROM products ORDER BY name_search LIMIT ?`, [SEARCH_LIMIT]);
  return rows.map(toProduct);
}

export async function countProducts(db: SqlDb): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>('SELECT COUNT(*) AS total FROM products', []);
  return row?.total ?? 0;
}

export async function saveProduct(
  db: SqlDb,
  input: { originalCode?: string; code: string; name: string; priceCents: number },
  now = new Date().toISOString(),
): Promise<void> {
  if (input.code !== input.originalCode && (await getProduct(db, input.code))) throw new DuplicateCodeError();
  const name = input.name.trim();
  if (input.originalCode) {
    await db.runAsync(
      `UPDATE products SET code = ?, name = ?, name_search = ?, price_cents = ?, updated_at = ? WHERE code = ?`,
      [input.code, name, toSearchText(name), input.priceCents, now, input.originalCode],
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO products (code, name, name_search, price_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [input.code, name, toSearchText(name), input.priceCents, now, now],
  );
}

export async function deleteProduct(db: SqlDb, code: string): Promise<void> {
  await db.runAsync('DELETE FROM products WHERE code = ?', [code]);
}

export async function allProducts(db: SqlDb): Promise<Product[]> {
  const rows = await db.getAllAsync<Row>(`SELECT ${COLUMNS} FROM products ORDER BY name_search`, []);
  return rows.map(toProduct);
}

/** Reemplaza todo o no cambia nada: si una fila falla, la transacción se revierte. */
export async function replaceAllProducts(db: SqlDb, products: Product[]): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM products', []);
    for (const product of products) {
      await txn.runAsync(
        `INSERT INTO products (code, name, name_search, price_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [product.code, product.name, toSearchText(product.name), product.priceCents, product.createdAt, product.updatedAt],
      );
    }
  });
}
