import { isValidBarcode } from '../lib/barcode.ts';
import { isValidCents } from '../lib/money.ts';
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
export const NAME_MAX = 120;

const toProduct = (row: Row): Product => ({
  code: row.code,
  name: row.name,
  priceCents: row.price_cents,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class DuplicateCodeError extends Error {}
/** El producto que se quería cambiar ya no existe (se borró o se recuperó un respaldo). */
export class MissingProductError extends Error {}
export class InvalidProductError extends Error {}

const isUniqueViolation = (error: unknown) => /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(String(error));

export async function getProduct(db: SqlDb, code: string): Promise<Product | null> {
  const row = await db.getFirstAsync<Row>(`SELECT ${COLUMNS} FROM products WHERE code = ?`, [code]);
  return row ? toProduct(row) : null;
}

/** Busca el primer código que exista de una lista de formas equivalentes (ver `barcodeCandidates`). */
export async function findProduct(db: SqlDb, codes: string[]): Promise<Product | null> {
  for (const code of codes) {
    const product = await getProduct(db, code);
    if (product) return product;
  }
  return null;
}

export async function searchProducts(db: SqlDb, query: string): Promise<Product[]> {
  const term = toSearchText(query);
  const rows = term
    ? await db.getAllAsync<Row>(
        `SELECT ${COLUMNS} FROM products
         WHERE name_search LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\'
         ORDER BY name_search, code LIMIT ?`,
        [`%${escapeLike(term)}%`, `%${escapeLike(query.trim().toUpperCase())}%`, SEARCH_LIMIT],
      )
    : await db.getAllAsync<Row>(`SELECT ${COLUMNS} FROM products ORDER BY name_search, code LIMIT ?`, [SEARCH_LIMIT]);
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
  const name = input.name.trim();
  if (!isValidBarcode(input.code) || !name || name.length > NAME_MAX || !isValidCents(input.priceCents)) {
    throw new InvalidProductError();
  }
  if (input.code !== input.originalCode && (await getProduct(db, input.code))) throw new DuplicateCodeError();
  try {
    if (input.originalCode) {
      const { changes } = await db.runAsync(
        `UPDATE products SET code = ?, name = ?, name_search = ?, price_cents = ?, updated_at = ? WHERE code = ?`,
        [input.code, name, toSearchText(name), input.priceCents, now, input.originalCode],
      );
      if (changes === 0) throw new MissingProductError();
      return;
    }
    await db.runAsync(
      `INSERT INTO products (code, name, name_search, price_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [input.code, name, toSearchText(name), input.priceCents, now, now],
    );
  } catch (error) {
    // Otro guardado pudo ganar entre la revisión y la escritura: se reporta igual que un duplicado.
    if (isUniqueViolation(error)) throw new DuplicateCodeError();
    throw error;
  }
}

export async function deleteProduct(db: SqlDb, code: string): Promise<void> {
  await db.runAsync('DELETE FROM products WHERE code = ?', [code]);
}

export async function allProducts(db: SqlDb): Promise<Product[]> {
  const rows = await db.getAllAsync<Row>(`SELECT ${COLUMNS} FROM products ORDER BY name_search, code`, []);
  return rows.map(toProduct);
}

/**
 * Aplica productos recibidos de otro teléfono: agrega los nuevos y actualiza los que traen un cambio más reciente.
 * Todo o nada: si una fila falla, no se aplica ninguna. Nunca borra productos.
 */
export async function applyMerge(
  db: SqlDb,
  plan: { add: readonly Product[]; update: readonly { after: Product }[] },
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const product of plan.add) {
      await txn.runAsync(
        `INSERT INTO products (code, name, name_search, price_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [product.code, product.name, toSearchText(product.name), product.priceCents, product.createdAt, product.updatedAt],
      );
    }
    for (const { after } of plan.update) {
      await txn.runAsync(
        `UPDATE products SET name = ?, name_search = ?, price_cents = ?, updated_at = ? WHERE code = ?`,
        [after.name, toSearchText(after.name), after.priceCents, after.updatedAt, after.code],
      );
    }
  });
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
