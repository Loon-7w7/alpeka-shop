import { NAME_MAX, type Product } from '../db/products.ts';
import { isNoteUnit, NOTE_NAME_MAX, noteKey, type PriceNote } from '../db/notes.ts';
import type { Promotion } from '../db/promotions.ts';
import { isValidBarcode, normalizeBarcode } from '../lib/barcode.ts';
import { isValidCents } from '../lib/money.ts';
import { parsePromoRule } from '../lib/promo.ts';

/**
 * Las promociones y las notas van en campos opcionales (`promotions`, `notes`) sin subir el formato:
 * así un teléfono con una versión anterior todavía puede recibir los productos (y solo ignora las promos).
 */
export const BACKUP_FORMAT = 1;

export class BackupError extends Error {}

/** `notes` es `null` si el archivo es de una versión sin notas (al recuperar se conservan las de aquí). */
export type BackupData = { products: Product[]; promotions: Promotion[]; notes: PriceNote[] | null };

export function createBackup(
  products: Product[],
  promotions: readonly Promotion[] = [],
  notes: readonly PriceNote[] = [],
  now = new Date().toISOString(),
): string {
  return JSON.stringify({ app: 'alpeka-shop', format: BACKUP_FORMAT, exportedAt: now, products, promotions, notes });
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
  const backup = (data ?? {}) as { app?: unknown; format?: unknown; products?: unknown; promotions?: unknown; notes?: unknown };
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
  return { products, promotions, notes: Array.isArray(backup.notes) ? parseNotes(backup.notes, fallback) : null };
}

/** Una nota inválida o repetida solo se omite: nunca rechaza el archivo. */
function parseNotes(items: unknown[], fallback: string): PriceNote[] {
  const notes: PriceNote[] = [];
  const keys = new Set<string>();
  for (const item of items) {
    const raw = (item ?? {}) as Partial<Record<keyof PriceNote, unknown>>;
    const name = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ') : '';
    const key = noteKey(name);
    if (!key || name.length > NOTE_NAME_MAX || keys.has(key) || !isValidCents(raw.priceCents) || !isNoteUnit(raw.unit)) continue;
    keys.add(key);
    notes.push({
      name,
      priceCents: raw.priceCents,
      unit: raw.unit,
      createdAt: validDate(raw.createdAt) ? raw.createdAt : fallback,
      updatedAt: validDate(raw.updatedAt) ? raw.updatedAt : fallback,
    });
  }
  return notes;
}
