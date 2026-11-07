import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { allProducts, applyMerge, replaceAllProducts } from '../db/products.ts';
import { allPromotions } from '../db/promotions.ts';
import { setSetting } from '../db/settings.ts';
import type { SqlDb } from '../db/types.ts';
import { BackupError, createBackup, parseBackupData, type BackupData } from './backup-format.ts';
import { mergeChanges, planMerge, type MergePlan } from './product-merge.ts';

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

/** Guarda la lista actual para poder deshacer (se conservan las últimas 5). */
async function saveSafetyCopy(db: SqlDb): Promise<void> {
  const folder = safetyFolder();
  if (!folder.exists) folder.create({ intermediates: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safety = new File(folder, `${SAFETY_PREFIX}${stamp}.json`);
  safety.create({ overwrite: true });
  await safety.write(createBackup(await allProducts(db), await allPromotions(db)));
}

function pruneSafetyCopies() {
  for (const old of safetyCopies().slice(KEEP_SAFETY_COPIES)) old.delete();
}

/**
 * Abre el menú de compartir de Android (WhatsApp, correo, Drive, Bluetooth…) con la lista de productos.
 * Android no avisa si la persona canceló, por eso la fecha guardada significa "último respaldo compartido".
 */
async function shareProductsFile(db: SqlDb, name: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new BackupError('Este teléfono no permite compartir archivos.');
  const products = await allProducts(db);
  if (products.length === 0) throw new BackupError('Todavía no hay productos para compartir.');
  const file = new File(Paths.cache, `${name}-${localDate()}.json`);
  file.create({ overwrite: true });
  await file.write(createBackup(products, await allPromotions(db)));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle, UTI: 'public.json' });
  await setSetting(db, 'last_backup_at', new Date().toISOString());
}

/** Respaldo completo, para guardarlo en Drive o en el correo. */
export const exportBackup = (db: SqlDb) => shareProductsFile(db, 'alpeka-shop-respaldo', 'Guardar respaldo de Alpeka Shop');

/** La misma lista, pensada para mandarla a otro teléfono que la recibirá y combinará. */
export const shareProducts = (db: SqlDb) => shareProductsFile(db, 'alpeka-shop-productos', 'Compartir productos de Alpeka Shop');

/** Lee y revisa un archivo de productos (con sus promociones). Nunca regresa una lista vacía. */
async function readProductsFile(file: File, size?: number | null): Promise<{ text: string; data: BackupData }> {
  if (size && size > MAX_BACKUP_BYTES) throw new BackupError('El archivo es demasiado grande para ser una lista de productos.');
  const text = await file.text();
  const data = parseBackupData(text);
  if (data.products.length === 0) throw new BackupError('Este archivo no tiene productos. Tu lista no se cambió.');
  return { text, data };
}

/** Elige un archivo con el selector del sistema. `null` si la persona canceló. */
export async function pickProductsFile(): Promise<{ text: string; data: BackupData } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const copy = new File(asset.uri);
  try {
    return await readProductsFile(copy, asset.size);
  } finally {
    try {
      if (copy.exists) copy.delete();
    } catch {
      // Es solo la copia temporal en caché; el sistema la limpia después.
    }
  }
}

/** Para "Recuperar un respaldo" (reemplaza la lista). */
export async function pickBackup(): Promise<{ text: string; count: number } | null> {
  const picked = await pickProductsFile();
  return picked ? { text: picked.text, count: picked.data.products.length } : null;
}

/** Lee el archivo que se abrió desde otra app (por ejemplo, tocándolo en WhatsApp). */
export async function readOpenedFile(uri: string): Promise<BackupData> {
  let file: File;
  try {
    file = new File(uri);
  } catch {
    throw new BackupError('No se pudo abrir el archivo. Guárdalo en el teléfono y usa "Recibir productos".');
  }
  try {
    return (await readProductsFile(file, file.size)).data;
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError('No se pudo leer el archivo. Guárdalo en el teléfono y usa "Recibir productos".');
  }
}

/** Calcula qué cambiaría sin tocar nada, para mostrar el resumen antes de confirmar. */
export async function previewReceive(db: SqlDb, data: BackupData): Promise<MergePlan> {
  return planMerge(await allProducts(db), data.products, { current: await allPromotions(db), incoming: data.promotions });
}

/**
 * Combina lo recibido con la lista actual: agrega lo nuevo y actualiza lo más reciente. No borra nada.
 * Se recalcula justo antes de aplicar por si la lista cambió mientras se veía el resumen.
 * Antes guarda una copia para poder deshacer.
 */
export async function receiveProducts(db: SqlDb, data: BackupData): Promise<MergePlan> {
  const plan = await previewReceive(db, data);
  if (mergeChanges(plan) === 0) return plan;
  await saveSafetyCopy(db);
  await applyMerge(db, plan);
  pruneSafetyCopies();
  return plan;
}

/** Guarda una copia de lo actual (se conservan las últimas 5) y luego reemplaza la lista. */
export async function restoreBackup(db: SqlDb, text: string): Promise<void> {
  const { products, promotions } = parseBackupData(text);
  await saveSafetyCopy(db);
  await replaceAllProducts(db, products, promotions);
  pruneSafetyCopies();
}

export function lastSafetyCopy(): { file: File; date: string } | null {
  const [file] = safetyCopies();
  if (!file) return null;
  const stamp = file.name.slice(SAFETY_PREFIX.length, -'.json'.length);
  // "2026-11-05T20-36-29-123Z" → "2026-11-05T20:36:29.123Z"
  const iso = stamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
  return { file, date: iso };
}

/** Deshace la última recuperación o recepción: vuelve a la lista que había justo antes. */
export async function undoLastRestore(db: SqlDb): Promise<void> {
  const last = lastSafetyCopy();
  if (!last) throw new BackupError('No hay un cambio que deshacer.');
  const { products, promotions } = parseBackupData(await last.file.text());
  await replaceAllProducts(db, products, promotions);
  last.file.delete();
}
