import { isValidCents } from '../lib/money.ts';
import { escapeLike, toSearchText } from '../lib/text.ts';
import type { SqlDb } from './types.ts';

/**
 * Nota de precio de algo sin código de barras (ej. Tomate · $35 el kilo).
 * Es solo para consultar: nunca se suma a la cuenta; al cobrar se usa "Precio suelto".
 */
export type PriceNote = {
  name: string;
  priceCents: number;
  unit: NoteUnit;
  createdAt: string;
  updatedAt: string;
};

export const NOTE_UNITS = ['kilo', 'pieza', 'manojo', 'docena'] as const;
export type NoteUnit = (typeof NOTE_UNITS)[number];
export const NOTE_NAME_MAX = 60;

export const isNoteUnit = (value: unknown): value is NoteUnit => NOTE_UNITS.includes(value as NoteUnit);
/** "el kilo", "la pieza"… para mostrar junto al precio. */
export const unitLabel = (unit: NoteUnit) => (unit === 'pieza' || unit === 'docena' ? `la ${unit}` : `el ${unit}`);

/** Identificador de la nota: el nombre sin acentos, mayúsculas ni espacios de más. */
export const noteKey = (name: string) => toSearchText(name).replace(/\s+/g, ' ');

type Row = { key: string; name: string; price_cents: number; unit: string; created_at: string; updated_at: string };

const COLUMNS = 'key, name, price_cents, unit, created_at, updated_at';

const toNote = (row: Row): PriceNote => ({
  name: row.name,
  priceCents: row.price_cents,
  unit: isNoteUnit(row.unit) ? row.unit : 'kilo',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class DuplicateNoteError extends Error {}
export class MissingNoteError extends Error {}
export class InvalidNoteError extends Error {}

export async function getNote(db: SqlDb, key: string): Promise<PriceNote | null> {
  const row = await db.getFirstAsync<Row>(`SELECT ${COLUMNS} FROM notes WHERE key = ?`, [key]);
  return row ? toNote(row) : null;
}

/** Notas ordenadas por nombre; con `query`, solo las que lo contienen (sin importar acentos). */
export async function listNotes(db: SqlDb, query = ''): Promise<PriceNote[]> {
  const term = noteKey(query);
  const rows = await db.getAllAsync<Row>(
    `SELECT ${COLUMNS} FROM notes WHERE ? = '' OR key LIKE ? ESCAPE '\\' ORDER BY key`,
    [term, `%${escapeLike(term)}%`],
  );
  return rows.map(toNote);
}

export const allNotes = (db: SqlDb) => listNotes(db);

export async function countNotes(db: SqlDb): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>('SELECT COUNT(*) AS total FROM notes', []);
  return row?.total ?? 0;
}

/** Crea o cambia una nota y regresa su clave. `originalKey` es la que tenía al abrirla para editar. */
export async function saveNote(
  db: SqlDb,
  input: { originalKey?: string; name: string; priceCents: number; unit: NoteUnit },
  now = new Date().toISOString(),
): Promise<string> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const key = noteKey(name);
  if (!key || name.length > NOTE_NAME_MAX || !isValidCents(input.priceCents) || !isNoteUnit(input.unit)) {
    throw new InvalidNoteError();
  }
  if (key !== input.originalKey && (await getNote(db, key))) throw new DuplicateNoteError();
  if (input.originalKey) {
    const { changes } = await db.runAsync(
      'UPDATE notes SET key = ?, name = ?, price_cents = ?, unit = ?, updated_at = ? WHERE key = ?',
      [key, name, input.priceCents, input.unit, now, input.originalKey],
    );
    if (changes === 0) throw new MissingNoteError();
    return key;
  }
  await db.runAsync(`INSERT INTO notes (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`, [key, name, input.priceCents, input.unit, now, now]);
  return key;
}

export async function deleteNote(db: SqlDb, key: string): Promise<void> {
  await db.runAsync('DELETE FROM notes WHERE key = ?', [key]);
}

/** Crea o reemplaza una nota tal cual viene. Se usa dentro de transacciones (recibir y recuperar). */
export async function writeNote(db: SqlDb, note: PriceNote): Promise<void> {
  await db.runAsync(
    `INSERT INTO notes (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET name = excluded.name, price_cents = excluded.price_cents, unit = excluded.unit,
       updated_at = excluded.updated_at`,
    [noteKey(note.name), note.name, note.priceCents, note.unit, note.createdAt, note.updatedAt],
  );
}
