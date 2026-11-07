/// <reference types="node" />
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { migrate } from '../src/db/migrations.ts';
import { allProducts, applyMerge, deleteProduct, replaceAllProducts, saveProduct } from '../src/db/products.ts';
import {
  activePromoRule, allPromotions, getPromotion, listPromotions, MissingPromoProductError, savePromotion, setPromotionActive,
} from '../src/db/promotions.ts';
import type { SqlDb } from '../src/db/types.ts';
import { addItem, cartSavings, cartTotal, parseCart, serializeCart } from '../src/lib/cart.ts';
import { buildPromoRule, describePromo, parsePromoRule, priceLine } from '../src/lib/promo.ts';
import { createBackup, parseBackupData } from '../src/services/backup-format.ts';
import { mergeChanges, planMerge } from '../src/services/product-merge.ts';

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

const product = (code: string, name: string, priceCents: number, updatedAt: string) => ({
  code, name, priceCents, createdAt: '2026-01-01T00:00:00.000Z', updatedAt,
});

const promo = (code: string, percent: number, updatedAt: string, active = true) => ({
  code, rule: { kind: 'percent' as const, percent }, active, createdAt: '2026-01-01T00:00:00.000Z', updatedAt,
});

test('promociones: cada tipo calcula bien en centavos y nunca cobra de más', () => {
  // 3 por $25 con precio normal $10: 7 piezas = 2 grupos ($50) + 1 suelta ($10).
  const bundle = { kind: 'bundle', qty: 3, priceCents: 2500 } as const;
  assert.deepEqual(priceLine(1000, 7, bundle), { totalCents: 6000, regularCents: 7000, savingsCents: 1000, hint: 'Lleva 2 más para el 3 por $25.00' });
  assert.equal(priceLine(1000, 3, bundle).hint, null);
  assert.equal(priceLine(1000, 2, bundle).totalCents, 2000);
  // 2x1 y 3x2.
  assert.equal(priceLine(1500, 5, { kind: 'nxm', take: 2, pay: 1 }).totalCents, 4500);
  assert.equal(priceLine(1500, 1, { kind: 'nxm', take: 2, pay: 1 }).hint, '¡Lleva 1 más gratis!');
  assert.equal(priceLine(1000, 6, { kind: 'nxm', take: 3, pay: 2 }).totalCents, 4000);
  assert.equal(priceLine(1000, 1, { kind: 'nxm', take: 3, pay: 2 }).hint, 'Lleva 2 más para el 3x2');
  assert.equal(priceLine(1000, 2, { kind: 'nxm', take: 3, pay: 2 }).hint, '¡Lleva 1 más gratis!');
  // Porcentaje: redondeo al centavo más cercano.
  assert.equal(priceLine(3333, 1, { kind: 'percent', percent: 15 }).totalCents, 2833); // 2833.05
  assert.equal(priceLine(3335, 1, { kind: 'percent', percent: 10 }).totalCents, 3002); // 3001.5
  assert.equal(priceLine(2000, 3, { kind: 'sale', priceCents: 1500 }).totalCents, 4500);
  // Si el precio normal bajó y la promo ya no conviene, se cobra el normal.
  assert.equal(priceLine(800, 3, bundle).totalCents, 2400);
  assert.equal(priceLine(1000, 2, { kind: 'sale', priceCents: 1200 }).totalCents, 2000);
  assert.equal(priceLine(1000, 2, null).savingsCents, 0);
});

test('promociones: el formulario valida contra el precio normal', () => {
  const empty = { qty: '', price: '', take: '', pay: '', percent: '' };
  const fieldOf = (result: ReturnType<typeof buildPromoRule>) => ('field' in result ? result.field : null);
  assert.deepEqual(buildPromoRule('bundle', { ...empty, qty: '3', price: '25' }, 1000), { rule: { kind: 'bundle', qty: 3, priceCents: 2500 } });
  assert.equal(fieldOf(buildPromoRule('bundle', { ...empty, qty: '3', price: '30' }, 1000)), 'price');
  assert.equal(fieldOf(buildPromoRule('bundle', { ...empty, qty: '1', price: '5' }, 1000)), 'qty');
  assert.equal(fieldOf(buildPromoRule('nxm', { ...empty, take: '2', pay: '2' }, 1000)), 'pay');
  assert.deepEqual(buildPromoRule('percent', { ...empty, percent: '10%' }, 1000), { rule: { kind: 'percent', percent: 10 } });
  assert.equal(fieldOf(buildPromoRule('percent', { ...empty, percent: '100' }, 1000)), 'percent');
  assert.equal(fieldOf(buildPromoRule('sale', { ...empty, price: '10' }, 1000)), 'price');
  assert.equal(describePromo({ kind: 'nxm', take: 2, pay: 1 }), '2x1');
  assert.equal(describePromo({ kind: 'percent', percent: 10 }), '10% menos');
  const bad = [null, {}, { kind: 'nxm', take: 2, pay: 2 }, { kind: 'percent', percent: 0 }, { kind: 'bundle', qty: 3, priceCents: 1.5 }, { kind: 'otra' }];
  for (const rule of bad) assert.equal(parsePromoRule(rule), null, JSON.stringify(rule));
});

test('la cuenta aplica la promoción y junta las piezas para alcanzarla', () => {
  const twoForOne = { kind: 'nxm', take: 2, pay: 1 } as const;
  let cart = addItem([], { code: '7501000000001', name: 'Jabón', priceCents: 2000, promo: twoForOne }, 'a');
  cart = addItem(cart, { code: '7501000000001', name: 'Jabón', priceCents: 2000, promo: twoForOne }, 'b');
  cart = addItem(cart, { code: null, name: 'Bolsa', priceCents: 500, promo: twoForOne }, 'c');
  assert.equal(cart.length, 2);
  assert.equal(cart[1].promo, null); // un precio suelto nunca lleva promoción
  assert.equal(cartTotal(cart), 2000 + 500);
  assert.equal(cartSavings(cart), 2000);
  // Al volver a escanear se toma la promoción más reciente (aquí ya se apagó).
  const off = addItem(cart, { code: '7501000000001', name: 'Jabón', priceCents: 2000, promo: null });
  assert.equal(off[0].qty, 3);
  assert.equal(cartTotal(off), 6000 + 500);
  // Se guarda y se recupera con la promoción; una cuenta vieja sin promo se cobra normal.
  assert.deepEqual(parseCart(serializeCart(cart)), cart);
  const old = JSON.stringify({ v: 1, items: [{ id: 'x', code: '7501000000001', name: 'Jabón', priceCents: 2000, qty: 2 }] });
  assert.equal(cartTotal(parseCart(old)), 4000);
});

test('promociones en la base de datos: una por producto y siguen al producto', async () => {
  const db = openDb();
  await migrate(db);
  await saveProduct(db, { code: '7501000000011', name: 'Leche', priceCents: 2850 });
  await assert.rejects(
    savePromotion(db, { code: '7509999999999', rule: { kind: 'percent', percent: 10 }, active: true }),
    MissingPromoProductError,
  );
  await savePromotion(db, { code: '7501000000011', rule: { kind: 'percent', percent: 10 }, active: true }, '2026-01-01T00:00:00.000Z');
  await savePromotion(db, { code: '7501000000011', rule: { kind: 'sale', priceCents: 2500 }, active: true }, '2026-01-02T00:00:00.000Z');
  const saved = await getPromotion(db, '7501000000011');
  assert.deepEqual(saved?.rule, { kind: 'sale', priceCents: 2500 });
  assert.equal(saved?.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal((await listPromotions(db, 'LECHE'))[0]?.name, 'Leche');
  await setPromotionActive(db, '7501000000011', false);
  assert.equal(await activePromoRule(db, '7501000000011'), null);
  await setPromotionActive(db, '7501000000011', true);
  // Si se corrige el código del producto, la promoción se va con él.
  await saveProduct(db, { originalCode: '7501000000011', code: '7501000000028', name: 'Leche', priceCents: 2850 });
  assert.equal(await getPromotion(db, '7501000000011'), null);
  assert.deepEqual(await activePromoRule(db, '7501000000028'), { kind: 'sale', priceCents: 2500 });
  // Al borrar el producto se borra su promoción.
  await deleteProduct(db, '7501000000028');
  assert.equal(await getPromotion(db, '7501000000028'), null);
});

test('promociones viajan en el respaldo y al recibir gana la más reciente', async () => {
  const products = [product('7501000000011', 'Leche', 2850, '2026-01-01T00:00:00.000Z'), product('7501000000028', 'Pan', 4200, '2026-01-01T00:00:00.000Z')];
  const file = createBackup(products, [
    promo('7501000000011', 20, '2026-02-01T00:00:00.000Z'),
    promo('7501000000028', 5, '2026-02-01T00:00:00.000Z'),
    promo('7509999999999', 5, '2026-02-01T00:00:00.000Z'), // su producto no viene: se omite
    { ...promo('7501000000028', 5, '2026-02-01T00:00:00.000Z'), rule: { kind: 'nada' } } as never, // dañada: se omite sin rechazar el archivo
  ]);
  const data = parseBackupData(file);
  assert.equal(data.promotions.length, 2);
  // Un archivo de la versión anterior (sin promociones) se sigue leyendo.
  const legacy = JSON.stringify({ app: 'alpeka-shop', format: 1, products });
  assert.deepEqual(parseBackupData(legacy).promotions, []);

  const db = openDb();
  await migrate(db);
  await replaceAllProducts(db, [products[0]], [promo('7501000000011', 10, '2026-01-15T00:00:00.000Z')]);
  const plan = planMerge(await allProducts(db), data.products, { current: await allPromotions(db), incoming: data.promotions });
  assert.equal(plan.promotions.update.length, 1); // la de Leche es más reciente en el archivo
  assert.equal(plan.promotions.add.length, 1); // Pan llega con su promoción
  assert.equal(mergeChanges(plan), 3); // Pan + 2 promociones
  await applyMerge(db, plan);
  assert.deepEqual((await getPromotion(db, '7501000000011'))?.rule, { kind: 'percent', percent: 20 });
  assert.deepEqual((await getPromotion(db, '7501000000028'))?.rule, { kind: 'percent', percent: 5 });

  // Apagarla aquí después gana sobre el archivo viejo.
  await replaceAllProducts(db, await allProducts(db), [promo('7501000000011', 20, '2026-03-01T00:00:00.000Z', false)]);
  const again = planMerge(await allProducts(db), data.products, { current: await allPromotions(db), incoming: data.promotions });
  assert.equal(again.promotions.update.length, 0);

  // Recuperar un respaldo reemplaza también las promociones.
  await replaceAllProducts(db, products, []);
  assert.equal((await allPromotions(db)).length, 0);
});
