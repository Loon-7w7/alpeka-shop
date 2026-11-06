import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { allProducts, replaceAllProducts } from '../db/products.ts';
import { setSetting } from '../db/settings.ts';
import type { SqlDb } from '../db/types.ts';
import { BackupError, createBackup, parseBackup } from './backup-format.ts';

const MAX_BACKUP_BYTES = 30 * 1024 * 1024;
const KEEP_SAFETY_COPIES = 5;
const SAFETY_PREFIX = 'antes-de-recuperar-';

const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const safetyFolder = () => new Directory(Paths.document, 'respaldos-previos');

/** Copias automáticas hechas antes de cada recuperación, de la más nueva a la más vieja. */
function safetyCopies(): File[] {
  const folder = safetyFolder();
  if (!folder.exists) return [];
  return folder
    .list()
    .filter((item): item is File => item instanceof File && item.name.startsWith(SAFETY_PREFIX))
    .sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Abre el diálogo de compartir para guardar el respaldo. Android no avisa si la persona canceló,
 * por eso la fecha guardada significa "último respaldo compartido".
 */
export async function exportBackup(db: SqlDb): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new BackupError('Este teléfono no permite compartir archivos.');
  const file = new File(Paths.cache, `alpeka-shop-respaldo-${localDate()}.json`);
  file.create({ overwrite: true });
  await file.write(createBackup(await allProducts(db)));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Guardar respaldo de Alpeka Shop',
    UTI: 'public.json',
  });
  await setSetting(db, 'last_backup_at', new Date().toISOString());
}

export async function pickBackup(): Promise<{ text: string; count: number } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const copy = new File(asset.uri);
  try {
    if (asset.size && asset.size > MAX_BACKUP_BYTES) throw new BackupError('El archivo es demasiado grande para ser un respaldo.');
    const text = await copy.text();
    const count = parseBackup(text).length;
    // Recuperar un respaldo vacío borraría todos los precios: se bloquea.
    if (count === 0) throw new BackupError('Este respaldo no tiene productos. Tu lista actual no se cambió.');
    return { text, count };
  } finally {
    try {
      if (copy.exists) copy.delete();
    } catch {
      // Es solo la copia temporal en caché; el sistema la limpia después.
    }
  }
}

/** Guarda una copia de lo actual (se conservan las últimas 5) y luego reemplaza la lista. */
export async function restoreBackup(db: SqlDb, text: string): Promise<void> {
  const products = parseBackup(text);
  const folder = safetyFolder();
  if (!folder.exists) folder.create({ intermediates: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safety = new File(folder, `${SAFETY_PREFIX}${stamp}.json`);
  safety.create({ overwrite: true });
  await safety.write(createBackup(await allProducts(db)));
  await replaceAllProducts(db, products);
  for (const old of safetyCopies().slice(KEEP_SAFETY_COPIES)) old.delete();
}

export function lastSafetyCopy(): { file: File; date: string } | null {
  const [file] = safetyCopies();
  if (!file) return null;
  const stamp = file.name.slice(SAFETY_PREFIX.length, -'.json'.length);
  // "2026-11-05T20-36-29-123Z" → "2026-11-05T20:36:29.123Z"
  const iso = stamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
  return { file, date: iso };
}

/** Deshace la última recuperación: vuelve a la lista que había justo antes. */
export async function undoLastRestore(db: SqlDb): Promise<void> {
  const last = lastSafetyCopy();
  if (!last) throw new BackupError('No hay una recuperación que deshacer.');
  await replaceAllProducts(db, parseBackup(await last.file.text()));
  last.file.delete();
}
