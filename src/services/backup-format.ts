import { NAME_MAX, type Product } from '../db/products.ts';
import type { Promotion } from '../db/promotions.ts';
import { isValidBarcode, normalizeBarcode } from '../lib/barcode.ts';
import { isValidCents } from '../lib/money.ts';
import { parsePromoRule } from '../lib/promo.ts';

/**
 * Las promociones van en un campo opcional `promotions` sin subir el formato:
 * así un teléfono con una versión anterior todavía puede recibir los productos (y solo ignora las promos).
 */
export const BACKUP_FORMAT = 1;

export class BackupError extends Error {}

export type BackupData = { products: Product[]; promotions: Promotion[] };

export function createBackup(products: Product[], promotions: readonly Promotion[] = [], now = new Date().toISOString()): string {
  return JSON.stringify({ app: 'alpeka-shop', format: BACKUP_FORMAT, exportedAt: now, products, promotions });
}

const validDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** Solo los productos del archivo (ver `parseBackupData`). */
export const parseBackup = (text: string): Product[] => parseBackupData(text).products;

/**
 * Revisa el archivo completo antes de tocar los datos del teléfono.
 * Un producto inválido rechaza el archivo; una promoción inválida (o de un producto que no viene) solo se omite.
 */
export function parseBackupData(text: string): BackupData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('El archivo está dañado o no es un respaldo de Alpeka Shop.');
  }
  const backup = (data ?? {}) as { app?: unknown; format?: unknown; products?: unknown; promotions?: unknown };
  if (backup.app !== 'alpeka-shop' || !Array.isArray(backup.products)) {
    throw new BackupError('Este archivo no es un respaldo de Alpeka Shop.');
  }
  if (typeof backup.format !== 'number' || !Number.isInteger(backup.format) || backup.format < 1) {
    throw new BackupError('Este archivo no es un respaldo de Alpeka Shop.');
  }
  if (backup.format > BACKUP_FORMAT) {
    throw new BackupError('Este respaldo es de una versión más nueva. Actualiza la app e inténtalo otra vez.');
  }
  const seen = new Set<string>();
  const fallback = new Date(0).toISOString();
  const products = backup.products.map((item, index): Product => {
    const p = (item ?? {}) as Partial<Product>;
    const row = index + 1;
    // Se normaliza igual que al escanear: "036000291452" y "0036000291452" son el mismo producto.
    const code = typeof p.code === 'string' ? normalizeBarcode(p.code) : '';
    if (!isValidBarcode(code)) throw new BackupError(`El producto ${row} tiene un código inválido.`);
    if (seen.has(code)) throw new BackupError(`El código ${code} está repetido en el respaldo.`);
    seen.add(code);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.trim().length > NAME_MAX) {
      throw new BackupError(`El producto ${row} tiene un nombre inválido.`);
    }
    if (!isValidCents(p.priceCents)) throw new BackupError(`El producto ${row} tiene un precio inválido.`);
    return {
      code,
      name: p.name.trim(),
      priceCents: p.priceCents,
      createdAt: validDate(p.createdAt) ? p.createdAt : fallback,
      updatedAt: validDate(p.updatedAt) ? p.updatedAt : fallback,
    };
  });
  const promotions: Promotion[] = [];
  const promoCodes = new Set<string>();
  for (const item of Array.isArray(backup.promotions) ? backup.promotions : []) {
    const raw = (item ?? {}) as Partial<Record<keyof Promotion, unknown>>;
    const code = typeof raw.code === 'string' ? normalizeBarcode(raw.code) : '';
    const rule = parsePromoRule(raw.rule);
    if (!seen.has(code) || promoCodes.has(code) || !rule || typeof raw.active !== 'boolean') continue;
    promoCodes.add(code);
    promotions.push({
      code,
      rule,
      active: raw.active,
      createdAt: validDate(raw.createdAt) ? raw.createdAt : fallback,
      updatedAt: validDate(raw.updatedAt) ? raw.updatedAt : fallback,
    });
  }
  return { products, promotions };
}
