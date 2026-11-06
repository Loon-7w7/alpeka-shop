import { NAME_MAX, type Product } from '../db/products.ts';
import { isValidBarcode, normalizeBarcode } from '../lib/barcode.ts';
import { isValidCents } from '../lib/money.ts';

export const BACKUP_FORMAT = 1;

export class BackupError extends Error {}

export function createBackup(products: Product[], now = new Date().toISOString()): string {
  return JSON.stringify({ app: 'alpeka-shop', format: BACKUP_FORMAT, exportedAt: now, products });
}

const validDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** Revisa el archivo completo antes de tocar los datos del teléfono. */
export function parseBackup(text: string): Product[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('El archivo está dañado o no es un respaldo de Alpeka Shop.');
  }
  const backup = (data ?? {}) as { app?: unknown; format?: unknown; products?: unknown };
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
  return backup.products.map((item, index) => {
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
}
