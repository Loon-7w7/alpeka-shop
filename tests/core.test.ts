/// <reference types="node" />
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { migrate, MIGRATIONS } from '../src/db/migrations.ts';
import {
  countProducts, deleteProduct, DuplicateCodeError, getProduct, replaceAllProducts, saveProduct, searchProducts,
} from '../src/db/products.ts';
import { getSetting, setSetting } from '../src/db/settings.ts';
import type { SqlDb } from '../src/db/types.ts';
import { isValidBarcode, normalizeBarcode } from '../src/lib/barcode.ts';
import { centsToInput, formatCents, parsePriceToCents } from '../src/lib/money.ts';
import { isNewerVersion, parseManifest } from '../src/lib/update-manifest.ts';
import { BackupError, createBackup, parseBackup } from '../src/services/backup-format.ts';

function openDb(sqlite = new DatabaseSync(':memory:')): SqlDb {
  const db: SqlDb = {
    execAsync: async (sql) => void sqlite.exec(sql),
    runAsync: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    getFirstAsync: async <T,>(sql: string, params: (string | number | null)[]) => (sqlite.prepare(sql).get(...params) as T) ?? null,
    getAllAsync: async <T,>(sql: string, params: (string | number | null)[]) => sqlite.prepare(sql).all(...params) as T[],
    withExclusiveTransactionAsync: async (task) => {
      sqlite.exec('BEGIN EXCLUSIVE');
      try {
        await task(db);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}

test('UPC-A y EAN-13 con 0 inicial son el mismo código', () => {
  assert.equal(normalizeBarcode('036000291452'), '0036000291452');
  assert.equal(normalizeBarcode('0036000291452'), '0036000291452');
  assert.equal(normalizeBarcode(' 7501055300013\n'), '7501055300013');
});

test('UPC-E se expande a su UPC-A', () => {
  assert.equal(normalizeBarcode('04252614', 'upc_e'), normalizeBarcode('042100005264'));
  assert.equal(normalizeBarcode('01234565', 'org.gs1.UPC-E'), normalizeBarcode('012345000065'));
});

test('EAN-8 y Code 128 no se alteran indebidamente', () => {
  assert.equal(normalizeBarcode('96385074', 'ean8'), '96385074');
  assert.equal(normalizeBarcode('ab-12', 'code128'), 'AB-12');
  assert.ok(isValidBarcode('AB-12'));
  assert.ok(!isValidBarcode('12'));
});

test('precios se leen sin errores de redondeo', () => {
  assert.equal(parsePriceToCents('28.5'), 2850);
  assert.equal(parsePriceToCents('28,50'), 2850);
  assert.equal(parsePriceToCents('$1,250.00'), 125000);
  assert.equal(parsePriceToCents('19.99'), 1999);
  assert.equal(parsePriceToCents('1.10'), 110);
  for (const bad of ['', '0', '0.00', 'abc', '1.234', '-5', '1.2.3']) assert.equal(parsePriceToCents(bad), null, bad);
});

test('precios se muestran con formato de pesos', () => {
  assert.equal(formatCents(2850), '$28.50');
  assert.equal(formatCents(125000), '$1,250.00');
  assert.equal(formatCents(5), '$0.05');
  assert.equal(centsToInput(2805), '28.05');
});

test('la migración crea tablas, es repetible y actualiza una base anterior', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const db = openDb(sqlite);
  await migrate(db);
  await migrate(db);
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  assert.equal(row?.user_version, MIGRATIONS.length);
  await saveProduct(db, { code: '7501055300013', name: 'Leche', priceCents: 2850 });
  await migrate(db);
  assert.equal(await countProducts(db), 1);
});

test('guardar, editar, buscar sin acentos y eliminar productos', async () => {
  const db = openDb();
  await migrate(db);
  await saveProduct(db, { code: '7501045400128', name: 'Atún 100% en agua', priceCents: 2250 });
  await saveProduct(db, { code: '7501055300013', name: 'Leche entera', priceCents: 2850 });
  assert.equal((await searchProducts(db, 'ATUN'))[0]?.code, '7501045400128');
  assert.equal((await searchProducts(db, '5300013'))[0]?.name, 'Leche entera');
  assert.equal((await searchProducts(db, '100%')).length, 1);
  assert.equal((await searchProducts(db, '_')).length, 0);
  assert.equal((await searchProducts(db, '')).length, 2);
  await assert.rejects(saveProduct(db, { code: '7501055300013', name: 'Otra', priceCents: 100 }), DuplicateCodeError);
  await assert.rejects(saveProduct(db, { originalCode: '7501045400128', code: '7501055300013', name: 'Otra', priceCents: 100 }), DuplicateCodeError);
  await saveProduct(db, { originalCode: '7501055300013', code: '7501055300020', name: 'Leche light', priceCents: 3000 });
  assert.equal(await getProduct(db, '7501055300013'), null);
  assert.equal((await getProduct(db, '7501055300020'))?.priceCents, 3000);
  await deleteProduct(db, '7501055300020');
  assert.equal(await countProducts(db), 1);
});

test('el respaldo ida y vuelta conserva los datos; uno malo se rechaza', async () => {
  const db = openDb();
  await migrate(db);
  await saveProduct(db, { code: '7501055300013', name: 'Leche', priceCents: 2850 });
  const text = createBackup((await searchProducts(db, '')));
  await deleteProduct(db, '7501055300013');
  await replaceAllProducts(db, parseBackup(text));
  assert.equal((await getProduct(db, '7501055300013'))?.priceCents, 2850);
  assert.throws(() => parseBackup('no json'), BackupError);
  assert.throws(() => parseBackup('{"app":"otra","products":[]}'), BackupError);
  assert.throws(() => parseBackup('{"app":"alpeka-shop","format":99,"products":[]}'), BackupError);
  const bad = (p: object) => JSON.stringify({ app: 'alpeka-shop', format: 1, products: [p] });
  assert.throws(() => parseBackup(bad({ code: '7501055300013', name: 'x', priceCents: 1.5 })), BackupError);
  assert.throws(() => parseBackup(bad({ code: '7501055300013', name: ' ', priceCents: 100 })), BackupError);
});

test('si recuperar falla, los datos anteriores quedan intactos', async () => {
  const db = openDb();
  await migrate(db);
  await saveProduct(db, { code: '7501055300013', name: 'Leche', priceCents: 2850 });
  const broken = [{ code: 'A1B2', name: 'Bien', priceCents: 100, createdAt: 'x', updatedAt: 'x' }, { code: 'A1B2', name: 'Repetido', priceCents: 100, createdAt: 'x', updatedAt: 'x' }];
  await assert.rejects(replaceAllProducts(db, broken));
  assert.equal(await countProducts(db), 1);
});

test('ajustes guardan y sobrescriben valores', async () => {
  const db = openDb();
  await migrate(db);
  assert.equal(await getSetting(db, 'welcome_seen'), null);
  await setSetting(db, 'welcome_seen', '1');
  await setSetting(db, 'welcome_seen', '2');
  assert.equal(await getSetting(db, 'welcome_seen'), '2');
});

test('versiones y version.json', () => {
  assert.ok(isNewerVersion('1.10.0', '1.9.9'));
  assert.ok(!isNewerVersion('1.0.0', '1.0.0'));
  assert.ok(!isNewerVersion('0.9.0', '1.0.0'));
  assert.ok(parseManifest({ version: '1.1.0', url: 'https://github.com/a/b/x.apk' }));
  assert.equal(parseManifest({ version: '1.1', url: 'https://a/x.apk' }), null);
  assert.equal(parseManifest({ version: '1.1.0', url: 'http://a/x.apk' }), null);
  assert.equal(parseManifest({ version: '1.1.0', url: 'https://a/x.apk', sha256: 'abc' }), null);
});
