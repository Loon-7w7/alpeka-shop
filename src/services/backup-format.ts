import type { Product } from '../db/products.ts';
import { isValidBarcode } from '../lib/barcode.ts';
import { isValidCents } from '../lib/money.ts';

export const BACKUP_FORMAT = 1;

export class BackupError extends Error {}

export function createBackup(products: Product[], now = new Date().toISOString()): string {
  return JSON.stringify({ app: 'alpeka-shop', format: BACKUP_FORMAT, exportedAt: now, products });
}

/** Revisa el archivo completo antes de tocar los datos del teléfono. */
export function parseBackup(text: string): Product[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('El archivo está dañado o no es un respaldo de Alpeka Shop.');
  }
  const backup = data as { app?: unknown; format?: unknown; products?: unknown };
  if (backup?.app !== 'alpeka-shop' || !Array.isArray(backup.products)) {
    throw new BackupError('Este archivo no es un respaldo de Alpeka Shop.');
  }
  if (typeof backup.format !== 'number' || backup.format > BACKUP_FORMAT) {
    throw new BackupError('Este respaldo es de una versión más nueva. Actualiza la app e inténtalo otra vez.');
  }
  const seen = new Set<string>();
  return backup.products.map((item, index) => {
    const p = item as Partial<Product>;
    const row = index + 1;
    if (typeof p?.code !== 'string' || !isValidBarcode(p.code)) throw new BackupError(`El producto ${row} tiene un código inválido.`);
    if (seen.has(p.code)) throw new BackupError(`El código ${p.code} está repetido en el respaldo.`);
    seen.add(p.code);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120) throw new BackupError(`El producto ${row} tiene un nombre inválido.`);
    if (!isValidCents(p.priceCents)) throw new BackupError(`El producto ${row} tiene un precio inválido.`);
    const fallback = new Date(0).toISOString();
    return {
      code: p.code,
      name: p.name.trim(),
      priceCents: p.priceCents,
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : fallback,
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : fallback,
    };
  });
}
