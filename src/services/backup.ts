import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { allProducts, replaceAllProducts } from '../db/products.ts';
import { setSetting } from '../db/settings.ts';
import type { SqlDb } from '../db/types.ts';
import { BackupError, createBackup, parseBackup } from './backup-format.ts';

const MAX_BACKUP_BYTES = 30 * 1024 * 1024;

export async function exportBackup(db: SqlDb): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) throw new BackupError('Este teléfono no permite compartir archivos.');
  const date = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `alpeka-shop-respaldo-${date}.json`);
  file.create({ overwrite: true });
  await file.write(createBackup(await allProducts(db)));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Guardar respaldo de Alpeka Shop',
    UTI: 'public.json',
  });
  await setSetting(db, 'last_backup_at', new Date().toISOString());
  return true;
}

export async function pickBackup(): Promise<{ text: string; count: number } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > MAX_BACKUP_BYTES) throw new BackupError('El archivo es demasiado grande para ser un respaldo.');
  const text = await new File(asset.uri).text();
  return { text, count: parseBackup(text).length };
}

/** Guarda una copia de lo actual dentro de la app y luego reemplaza la lista. */
export async function restoreBackup(db: SqlDb, text: string): Promise<void> {
  const products = parseBackup(text);
  const safety = new File(Paths.document, 'antes-de-recuperar.json');
  safety.create({ overwrite: true });
  await safety.write(createBackup(await allProducts(db)));
  await replaceAllProducts(db, products);
}
