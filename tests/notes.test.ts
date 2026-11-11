/// <reference types="node" />
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { migrate } from '../src/db/migrations.ts';
import {
  allNotes, countNotes, deleteNote, DuplicateNoteError, getNote, InvalidNoteError, listNotes, MissingNoteError, saveNote,
  type PriceNote,
} from '../src/db/notes.ts';
import { allProducts, applyMerge, replaceAllProducts, saveProduct } from '../src/db/products.ts';
import type { SqlDb } from '../src/db/types.ts';
import { createBackup, parseBackupData } from '../src/services/backup-format.ts';
import { mergeChanges, noteChanges, planMerge } from '../src/services/product-merge.ts';

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

const note = (name: string, priceCents: number, updatedAt: string, unit: PriceNote['unit'] = 'kilo'): PriceNote => ({
  name, priceCents, unit, createdAt: '2026-01-01T00:00:00.000Z', updatedAt,
});

test('notas: guardar, buscar sin acentos, renombrar, repetidas y borrar', async () => {
  const db = openDb();
  await migrate(db);
  const key = await saveNote(db, { name: '  Plátano   macho ', priceCents: 2800, unit: 'kilo' });
  assert.equal(key, 'platano macho');
  await saveNote(db, { name: 'Cilantro', priceCents: 1000, unit: 'manojo' });
  assert.equal(await countNotes(db), 2);
  assert.deepEqual((await listNotes(db, 'PLATANO')).map((n) => n.name), ['Plátano macho']);
  assert.deepEqual((await listNotes(db)).map((n) => n.name), ['Cilantro', 'Plátano macho']);
  await assert.rejects(saveNote(db, { name: 'cilantro', priceCents: 900, unit: 'manojo' }), DuplicateNoteError);
  await assert.rejects(saveNote(db, { name: ' ', priceCents: 900, unit: 'kilo' }), InvalidNoteError);
  await assert.rejects(saveNote(db, { name: 'Ajo', priceCents: 0, unit: 'kilo' }), InvalidNoteError);
  await assert.rejects(saveNote(db, { originalKey: 'no existe', name: 'Ajo', priceCents: 100, unit: 'kilo' }), MissingNoteError);
  // Renombrar cambia su clave.
  const renamed = await saveNote(db, { originalKey: key, name: 'Plátano', priceCents: 2500, unit: 'kilo' });
  assert.equal(await getNote(db, key), null);
  assert.equal((await getNote(db, renamed))?.priceCents, 2500);
  await deleteNote(db, renamed);
  assert.equal(await countNotes(db), 1);
});

test('notas: viajan en el respaldo; un archivo viejo o una nota dañada no rompen nada', async () => {
  const products = [{ code: '7501000000011', name: 'Leche', priceCents: 2850, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }];
  const file = createBackup(products, [], [
    note('Tomate', 3500, '2026-02-01T00:00:00.000Z'),
    note('tomate', 3600, '2026-02-01T00:00:00.000Z'), // repetida: se omite
    { ...note('Ajo', 100, '2026-02-01T00:00:00.000Z'), unit: 'litro' } as never, // unidad desconocida: se omite
  ]);
  const data = parseBackupData(file);
  assert.deepEqual(data.notes?.map((n) => n.name), ['Tomate']);
  const legacy = JSON.stringify({ app: 'alpeka-shop', format: 1, products });
  assert.equal(parseBackupData(legacy).notes, null);

  // Recuperar un archivo viejo (sin notas) conserva las notas de este teléfono.
  const db = openDb();
  await migrate(db);
  await saveNote(db, { name: 'Cebolla', priceCents: 3000, unit: 'kilo' });
  await replaceAllProducts(db, products, [], parseBackupData(legacy).notes);
  assert.equal(await countNotes(db), 1);
  // Uno nuevo sí las reemplaza.
  await replaceAllProducts(db, products, [], data.notes);
  assert.deepEqual((await allNotes(db)).map((n) => n.name), ['Tomate']);
});

test('notas: al recibir se agregan las nuevas y gana el cambio más reciente', async () => {
  const db = openDb();
  await migrate(db);
  await saveProduct(db, { code: '7501000000011', name: 'Leche', priceCents: 2850 });
  await replaceAllProducts(db, await allProducts(db), [], [
    note('Tomate', 3500, '2026-03-01T00:00:00.000Z'),
    note('Papa', 2500, '2026-03-01T00:00:00.000Z'),
  ]);
  const incoming = [
    note('tomate', 3800, '2026-04-01T00:00:00.000Z'), // más reciente: se actualiza
    note('Papa', 2000, '2026-02-01T00:00:00.000Z'), // más vieja: se conserva la de aquí
    note('Limón', 4000, '2026-02-01T00:00:00.000Z'), // nueva
  ];
  const plan = planMerge(await allProducts(db), [], { current: [], incoming: [] }, { current: await allNotes(db), incoming });
  assert.equal(noteChanges(plan), 2);
  assert.equal(mergeChanges(plan), 2);
  await applyMerge(db, plan);
  const byName = Object.fromEntries((await allNotes(db)).map((n) => [n.name, n.priceCents]));
  assert.deepEqual(byName, { tomate: 3800, Papa: 2500, Limón: 4000 });
  // Lo recibido no toca productos.
  assert.equal((await allProducts(db)).length, 1);
});
