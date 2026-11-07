import { parsePromoRule, type PromoRule } from '../lib/promo.ts';
import { escapeLike, toSearchText } from '../lib/text.ts';
import type { SqlDb } from './types.ts';

/** Promoción de un producto, identificada por su código de barras (una por producto). */
export type Promotion = {
  code: string;
  rule: PromoRule;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Promoción con los datos del producto, para la pestaña Promos. */
export type PromotionListItem = Promotion & { name: string; priceCents: number };

type Row = { code: string; rule: string; active: number; created_at: string; updated_at: string };

const COLUMNS = 'code, rule, active, created_at, updated_at';

export class MissingPromoProductError extends Error {}

function toPromotion(row: Row): Promotion | null {
  let rule: PromoRule | null;
  try {
    rule = parsePromoRule(JSON.parse(row.rule));
  } catch {
    rule = null;
  }
  // Una regla dañada se ignora: el producto se cobra a precio normal.
  if (!rule) return null;
  return { code: row.code, rule, active: row.active === 1, createdAt: row.created_at, updatedAt: row.updated_at };
}

const compact = <T,>(items: (T | null)[]) => items.filter((item): item is T => item !== null);

export async function getPromotion(db: SqlDb, code: string): Promise<Promotion | null> {
  const row = await db.getFirstAsync<Row>(`SELECT ${COLUMNS} FROM promotions WHERE code = ?`, [code]);
  return row ? toPromotion(row) : null;
}

/** La regla que se aplica al cobrar ese código, o `null` si no tiene promoción activa. */
export async function activePromoRule(db: SqlDb, code: string): Promise<PromoRule | null> {
  const promo = await getPromotion(db, code);
  return promo?.active ? promo.rule : null;
}

/** Promociones con su producto, ordenadas por nombre. Las de productos borrados no aparecen. */
export async function listPromotions(db: SqlDb, query = ''): Promise<PromotionListItem[]> {
  const term = toSearchText(query);
  const rows = await db.getAllAsync<Row & { name: string; price_cents: number }>(
    `SELECT p.code, p.rule, p.active, p.created_at, p.updated_at, pr.name, pr.price_cents
     FROM promotions p JOIN products pr ON pr.code = p.code
     WHERE ? = '' OR pr.name_search LIKE ? ESCAPE '\\' OR pr.code LIKE ? ESCAPE '\\'
     ORDER BY pr.name_search, p.code`,
    [term, `%${escapeLike(term)}%`, `%${escapeLike(query.trim().toUpperCase())}%`],
  );
  return compact(
    rows.map((row) => {
      const promo = toPromotion(row);
      return promo ? { ...promo, name: row.name, priceCents: row.price_cents } : null;
    }),
  );
}

export async function allPromotions(db: SqlDb): Promise<Promotion[]> {
  const rows = await db.getAllAsync<Row>(`SELECT ${COLUMNS} FROM promotions ORDER BY code`, []);
  return compact(rows.map(toPromotion));
}

/** Crea o reemplaza una promoción. Se usa también dentro de transacciones (recibir y recuperar). */
export async function writePromotion(db: SqlDb, promo: Promotion): Promise<void> {
  await db.runAsync(
    `INSERT INTO promotions (code, rule, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET rule = excluded.rule, active = excluded.active, updated_at = excluded.updated_at`,
    [promo.code, JSON.stringify(promo.rule), promo.active ? 1 : 0, promo.createdAt, promo.updatedAt],
  );
}

/** Guarda la promoción de un producto que exista. Si ya tenía una, la reemplaza. */
export async function savePromotion(
  db: SqlDb,
  input: { code: string; rule: PromoRule; active: boolean },
  now = new Date().toISOString(),
): Promise<void> {
  const rule = parsePromoRule(input.rule);
  if (!rule) throw new Error('Promoción inválida');
  const product = await db.getFirstAsync<{ code: string }>('SELECT code FROM products WHERE code = ?', [input.code]);
  if (!product) throw new MissingPromoProductError();
  const existing = await getPromotion(db, input.code);
  await writePromotion(db, { code: input.code, rule, active: input.active, createdAt: existing?.createdAt ?? now, updatedAt: now });
}

export async function setPromotionActive(db: SqlDb, code: string, active: boolean, now = new Date().toISOString()): Promise<void> {
  await db.runAsync('UPDATE promotions SET active = ?, updated_at = ? WHERE code = ?', [active ? 1 : 0, now, code]);
}

export async function deletePromotion(db: SqlDb, code: string): Promise<void> {
  await db.runAsync('DELETE FROM promotions WHERE code = ?', [code]);
}
