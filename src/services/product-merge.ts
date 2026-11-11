import { noteKey, type PriceNote } from '../db/notes.ts';
import type { Product } from '../db/products.ts';
import type { Promotion } from '../db/promotions.ts';
import { sameRule } from '../lib/promo.ts';

/** Un producto que ya existe y cambia con lo recibido. */
export type MergeUpdate = { before: Product; after: Product };

export type MergePlan = {
  /** Códigos que no existían en este teléfono. */
  add: Product[];
  /** Mismo código, pero el archivo trae un cambio más reciente (precio o nombre distinto). */
  update: MergeUpdate[];
  /** Mismo código y mismos datos. */
  same: number;
  /** Mismo código, pero en este teléfono se cambió después: se conserva el de aquí. */
  keptNewer: number;
  /** Promociones que se agregan o actualizan (mismas reglas: código de barras y gana lo más reciente). */
  promotions: { add: Promotion[]; update: Promotion[] };
  /** Notas de precio que se agregan o actualizan (mismo nombre = misma nota; gana lo más reciente). */
  notes: { add: PriceNote[]; update: PriceNote[] };
};

const time = (iso: string) => {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
};

/**
 * Decide qué hacer con cada producto recibido, usando el código de barras como identificador.
 * Nunca borra: lo que solo existe en este teléfono se queda igual.
 * Con el mismo código gana el cambio más reciente, para no regresar un precio viejo.
 */
export function planMerge(
  current: readonly Product[],
  incoming: readonly Product[],
  promos: { current: readonly Promotion[]; incoming: readonly Promotion[] } = { current: [], incoming: [] },
  notes: { current: readonly PriceNote[]; incoming: readonly PriceNote[] } = { current: [], incoming: [] },
): MergePlan {
  const byCode = new Map(current.map((product) => [product.code, product]));
  const plan: MergePlan = {
    add: [], update: [], same: 0, keptNewer: 0, promotions: { add: [], update: [] }, notes: { add: [], update: [] },
  };
  for (const product of incoming) {
    const existing = byCode.get(product.code);
    if (!existing) {
      plan.add.push(product);
      byCode.set(product.code, product);
      continue;
    }
    if (existing.name === product.name && existing.priceCents === product.priceCents) {
      plan.same += 1;
      continue;
    }
    if (time(product.updatedAt) > time(existing.updatedAt)) {
      // Se conserva la fecha de creación de este teléfono y la fecha del cambio que llegó,
      // así la siguiente vez que se comparta se sigue comparando bien.
      plan.update.push({ before: existing, after: { ...product, createdAt: existing.createdAt } });
    } else {
      plan.keptNewer += 1;
    }
  }
  // Solo promociones de productos que existirán aquí después de combinar.
  const promoByCode = new Map(promos.current.map((promo) => [promo.code, promo]));
  for (const promo of promos.incoming) {
    if (!byCode.has(promo.code)) continue;
    const existing = promoByCode.get(promo.code);
    if (!existing) {
      plan.promotions.add.push(promo);
      promoByCode.set(promo.code, promo);
    } else if (
      !(sameRule(existing.rule, promo.rule) && existing.active === promo.active) &&
      time(promo.updatedAt) > time(existing.updatedAt)
    ) {
      plan.promotions.update.push({ ...promo, createdAt: existing.createdAt });
    }
  }
  const noteByKey = new Map(notes.current.map((note) => [noteKey(note.name), note]));
  for (const note of notes.incoming) {
    const key = noteKey(note.name);
    const existing = noteByKey.get(key);
    if (!existing) {
      plan.notes.add.push(note);
      noteByKey.set(key, note);
    } else if (
      !(existing.name === note.name && existing.priceCents === note.priceCents && existing.unit === note.unit) &&
      time(note.updatedAt) > time(existing.updatedAt)
    ) {
      plan.notes.update.push({ ...note, createdAt: existing.createdAt });
    }
  }
  return plan;
}

export const promoChanges = (plan: MergePlan) => plan.promotions.add.length + plan.promotions.update.length;

export const noteChanges = (plan: MergePlan) => plan.notes.add.length + plan.notes.update.length;

export const mergeChanges = (plan: MergePlan) => plan.add.length + plan.update.length + promoChanges(plan) + noteChanges(plan);
