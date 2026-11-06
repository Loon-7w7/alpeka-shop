import type { Product } from '../db/products.ts';

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
export function planMerge(current: readonly Product[], incoming: readonly Product[]): MergePlan {
  const byCode = new Map(current.map((product) => [product.code, product]));
  const plan: MergePlan = { add: [], update: [], same: 0, keptNewer: 0 };
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
  return plan;
}

export const mergeChanges = (plan: MergePlan) => plan.add.length + plan.update.length;
