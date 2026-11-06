/// <reference types="node" />
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { migrate, MIGRATIONS } from '../src/db/migrations.ts';
import {
  countProducts, deleteProduct, DuplicateCodeError, findProduct, getProduct, InvalidProductError, MissingProductError,
  replaceAllProducts, saveProduct, searchProducts,
} from '../src/db/products.ts';
import { getSetting, scanSoundOn, setSetting } from '../src/db/settings.ts';
import type { SqlDb } from '../src/db/types.ts';
import { barcodeCandidates, isValidBarcode, normalizeBarcode } from '../src/lib/barcode.ts';
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
  assert.ok(isNewerVersion('1.0.1', '1.0.0-rc1'));
  assert.ok(isNewerVersion('1.1', '1.0.9'));

  const sha = 'A'.repeat(64);
  const url = 'https://github.com/Loon-7w7/alpeka-shop/releases/download/v1.1.0/alpeka-shop.apk';
  assert.deepEqual(parseManifest({ version: '1.1.0', url, sha256: sha, notes: 'x'.repeat(400) }), {
    version: '1.1.0', url, sha256: 'a'.repeat(64), notes: 'x'.repeat(300),
  });
  // Sin hash no se instala nada.
  assert.equal(parseManifest({ version: '1.1.0', url }), null);
  assert.equal(parseManifest({ version: '1.1.0', url, sha256: 'abc' }), null);
  // Solo Releases de GitHub y con la misma versión en la ruta.
  assert.equal(parseManifest({ version: '1.1.0', url: 'https://evil.example/releases/download/v1.1.0/x.apk', sha256: sha }), null);
  assert.equal(parseManifest({ version: '1.2.0', url, sha256: sha }), null);
  assert.equal(parseManifest({ version: '1.1.0', url: url.replace('https', 'http'), sha256: sha }), null);
  assert.equal(parseManifest({ version: '1.1', url, sha256: sha }), null);
  assert.equal(parseManifest(null), null);
});

test('UPC-E: todas las ramas y dígito de control', () => {
  // Terminación 3: abc00000de; terminación 4: abcd00000e (+ dígito de control calculado a mano).
  assert.equal(normalizeBarcode('123453', 'upc_e'), '0012300000451');
  assert.equal(normalizeBarcode('123454', 'upc_e'), '0012340000053');
  assert.equal(normalizeBarcode('0123453', 'upc_e'), '0012300000451');
  // Dígito de control incorrecto o sistema 2-9: no es UPC-E, se deja igual.
  assert.equal(normalizeBarcode('04252615', 'upc_e'), '04252615');
  assert.equal(normalizeBarcode('96385074', 'upc_e'), '96385074');
});

test('lo escaneado y lo tecleado encuentran el mismo producto', async () => {
  // Tecleado en 8 dígitos: se busca como EAN-8 y como UPC-E expandido.
  assert.deepEqual(barcodeCandidates('04252614'), ['04252614', '0042100005264']);
  // Escaneado como UPC-E: primero la forma expandida, luego los 8 dígitos tal cual.
  assert.deepEqual(barcodeCandidates('04252614', 'upc_e'), ['0042100005264', '04252614']);
  assert.deepEqual(barcodeCandidates('7501055300013', 'ean13'), ['7501055300013']);
  assert.deepEqual(barcodeCandidates('12'), []);

  const db = openDb();
  await migrate(db);
  await saveProduct(db, { code: '04252614', name: 'Chicle', priceCents: 500 });
  assert.equal((await findProduct(db, barcodeCandidates('04252614', 'upc_e')))?.name, 'Chicle');
  assert.equal(await findProduct(db, ['0000000000000']), null);
});

test('precios: casos que escribe un cajero', () => {
  assert.equal(parsePriceToCents('.50'), 50);
  assert.equal(parsePriceToCents('5.'), 500);
  assert.equal(parsePriceToCents('1,5'), 150);
  assert.equal(parsePriceToCents('1,250'), 125000);
  assert.equal(parsePriceToCents('9999999.99'), 999999999);
  for (const bad of ['.', '10000000.00', '.5.', '$']) assert.equal(parsePriceToCents(bad), null, bad);
});

test('guardar valida datos y avisa si el producto ya no existe', async () => {
  const db = openDb();
  await migrate(db);
  await assert.rejects(saveProduct(db, { code: '7501055300013', name: '  ', priceCents: 100 }), InvalidProductError);
  await assert.rejects(saveProduct(db, { code: '7501055300013', name: 'x'.repeat(121), priceCents: 100 }), InvalidProductError);
  await assert.rejects(saveProduct(db, { code: '7501055300013', name: 'Leche', priceCents: 0 }), InvalidProductError);
  await assert.rejects(saveProduct(db, { code: '12', name: 'Leche', priceCents: 100 }), InvalidProductError);
  // Cambiar un producto que otra pantalla ya borró no debe decir "guardado".
  await assert.rejects(
    saveProduct(db, { originalCode: '7501055300013', code: '7501055300013', name: 'Leche', priceCents: 100 }),
    MissingProductError,
  );
  assert.equal(await countProducts(db), 0);
});

test('la búsqueda escapa la diagonal invertida y ordena de forma estable', async () => {
  const db = openDb();
  await migrate(db);
  await saveProduct(db, { code: 'B2', name: 'Pan', priceCents: 100 }).catch(() => undefined);
  await saveProduct(db, { code: 'BBBB', name: 'Pan', priceCents: 100 });
  await saveProduct(db, { code: 'AAAA', name: 'Pan', priceCents: 100 });
  await saveProduct(db, { code: 'CCCC', name: 'Café \\ molido', priceCents: 100 });
  assert.deepEqual((await searchProducts(db, 'pan')).map((p) => p.code), ['AAAA', 'BBBB']);
  assert.equal((await searchProducts(db, '\\')).length, 1);
});

test('respaldo: códigos equivalentes, formato y fechas', () => {
  const wrap = (products: unknown[], format: unknown = 1) => JSON.stringify({ app: 'alpeka-shop', format, products });
  const item = (code: string, extra: object = {}) => ({ code, name: 'Leche', priceCents: 100, ...extra });
  // 12 y 13 dígitos son el mismo producto: se normaliza y se detecta repetido.
  assert.equal(parseBackup(wrap([item('036000291452')]))[0]?.code, '0036000291452');
  assert.throws(() => parseBackup(wrap([item('036000291452'), item('0036000291452')])), BackupError);
  for (const format of [0, -1, 1.5, '1']) assert.throws(() => parseBackup(wrap([], format)), BackupError, String(format));
  assert.throws(() => parseBackup(wrap([null])), BackupError);
  assert.throws(() => parseBackup('null'), BackupError);
  assert.throws(() => parseBackup('{}'), BackupError);
  assert.throws(() => parseBackup(wrap([item('7501055300013', { name: 'x'.repeat(121) })])), BackupError);
  const [fixed] = parseBackup(wrap([item('7501055300013', { createdAt: 'x', updatedAt: '2026-01-02T03:04:05.000Z' })]));
  assert.equal(fixed?.createdAt, new Date(0).toISOString());
  assert.equal(fixed?.updatedAt, '2026-01-02T03:04:05.000Z');
});

test('la cuenta suma productos y junta el mismo código', async () => {
  const { addItem, cartCount, cartTotal, setQty } = await import('../src/lib/cart.ts');
  let cart = addItem([], { code: '7501000000001', name: 'Leche', priceCents: 2850 }, 'a');
  cart = addItem(cart, { code: '7501000000001', name: 'Leche', priceCents: 2850 }, 'b');
  cart = addItem(cart, { code: null, name: '', priceCents: 1000 }, 'c');
  cart = addItem(cart, { code: null, name: 'Dulces', priceCents: 1000 }, 'd');
  assert.equal(cart.length, 3);
  assert.equal(cart[0].qty, 2);
  assert.equal(cart[1].name, 'Precio suelto');
  assert.equal(cartCount(cart), 4);
  assert.equal(cartTotal(cart), 2850 * 2 + 1000 + 1000);
  cart = setQty(cart, 'a', 0);
  assert.equal(cart.length, 2);
  assert.equal(setQty(cart, 'c', 5000)[0].qty, 999);
  assert.equal(addItem(cart, { code: null, name: 'x', priceCents: 0 }), cart);
});

test('la cuenta separa el mismo código si cambió el precio', async () => {
  const { addItem } = await import('../src/lib/cart.ts');
  let cart = addItem([], { code: '7501000000001', name: 'Leche', priceCents: 2850 }, 'a');
  cart = addItem(cart, { code: '7501000000001', name: 'Leche', priceCents: 3000 }, 'b');
  assert.equal(cart.length, 2);
});

test('el cambio se calcula en centavos', async () => {
  const { changeFor } = await import('../src/lib/cart.ts');
  assert.equal(changeFor(8550, 10000), 1450);
  assert.equal(changeFor(8550, 5000), -3550);
});

test('la cuenta guardada se recupera y descarta líneas dañadas', async () => {
  const { addItem, parseCart, serializeCart } = await import('../src/lib/cart.ts');
  const cart = addItem([], { code: '7501000000001', name: 'Leche', priceCents: 2850 }, 'a');
  assert.deepEqual(parseCart(serializeCart(cart)), cart);
  assert.deepEqual(parseCart(null), []);
  assert.deepEqual(parseCart('no es json'), []);
  const mixed = JSON.stringify({
    v: 1,
    items: [cart[0], { id: 'b', code: null, name: 'x', priceCents: -1, qty: 1 }, { id: 'a', code: null, name: 'dup', priceCents: 100, qty: 1 }],
  });
  assert.deepEqual(parseCart(mixed), cart);
});

test('la cuenta se guarda en settings sin tocar productos', async () => {
  const db = openDb();
  await migrate(db);
  await setSetting(db, 'cart', '{"v":1,"items":[]}');
  assert.equal(await getSetting(db, 'cart'), '{"v":1,"items":[]}');
  assert.equal(await countProducts(db), 0);
});

test('todos los temas se leen bien (contraste WCAG AA)', async () => {
  const { contrast, PALETTES, THEME_COLORS } = await import('../src/theme/palettes.ts');
  // [texto, fondo]: cada par que la app pinta uno sobre otro.
  const pairs = [
    ['ink', 'ground'], ['ink', 'surface'], ['muted', 'ground'], ['muted', 'surface'],
    ['accent', 'ground'], ['accent', 'surface'], ['ink', 'primarySoft'], ['onPrimary', 'primary'],
    ['onPrimary', 'highlight'], ['danger', 'surface'], ['danger', 'dangerSoft'], ['highlight', 'camera'], ['highlight', 'cameraPanel'],
  ] as const;
  for (const color of THEME_COLORS) {
    for (const scheme of ['light', 'dark'] as const) {
      const p = PALETTES[color][scheme];
      assert.equal(p.scheme, scheme);
      for (const [fg, bg] of pairs) {
        const ratio = contrast(p[fg], p[bg]);
        assert.ok(ratio >= 4.5, `${color} ${scheme}: ${fg} sobre ${bg} = ${ratio.toFixed(2)}`);
      }
    }
  }
});

test('el tema guardado se valida antes de usarse', async () => {
  const { isThemeColor, isThemeMode } = await import('../src/theme/palettes.ts');
  assert.ok(isThemeColor('rosa') && isThemeColor('azul'));
  assert.ok(!isThemeColor('morado') && !isThemeColor(null));
  assert.ok(isThemeMode('system') && isThemeMode('dark'));
  assert.ok(!isThemeMode('noche'));
  const db = openDb();
  await migrate(db);
  await setSetting(db, 'theme_color', 'verde');
  await setSetting(db, 'theme_mode', 'dark');
  assert.equal(await getSetting(db, 'theme_color'), 'verde');
  assert.equal(await getSetting(db, 'theme_mode'), 'dark');
});

test('el beep del escáner viene encendido y se puede apagar', async () => {
  assert.equal(scanSoundOn(null), true);
  assert.equal(scanSoundOn('1'), true);
  assert.equal(scanSoundOn('0'), false);
  const db = openDb();
  await migrate(db);
  assert.equal(scanSoundOn(await getSetting(db, 'scan_sound')), true);
  await setSetting(db, 'scan_sound', '0');
  assert.equal(scanSoundOn(await getSetting(db, 'scan_sound')), false);
});
