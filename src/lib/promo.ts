import { formatCents, isValidCents, parsePriceToCents } from './money.ts';

/**
 * Reglas de promoción de un producto. Todo se calcula en centavos enteros.
 * - `bundle`: "3 por $25": cada grupo de `qty` piezas cuesta `priceCents`; las sobrantes van a precio normal.
 * - `nxm`: "2x1", "3x2": de cada `take` piezas se pagan `pay`.
 * - `percent`: descuento del `percent`% sobre la línea, redondeado al centavo más cercano.
 * - `sale`: precio de oferta por pieza.
 */
export type PromoRule =
  | { kind: 'bundle'; qty: number; priceCents: number }
  | { kind: 'nxm'; take: number; pay: number }
  | { kind: 'percent'; percent: number }
  | { kind: 'sale'; priceCents: number };

export type PromoKind = PromoRule['kind'];

export const PROMO_KINDS: readonly PromoKind[] = ['bundle', 'nxm', 'percent', 'sale'];
export const PROMO_QTY_MAX = 99;

export const PROMO_KIND_NAMES: Record<PromoKind, string> = {
  bundle: 'Cantidad por precio',
  nxm: 'Lleva y paga (2x1)',
  percent: 'Descuento %',
  sale: 'Precio de oferta',
};

const isInt = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

/** Revisa la forma de una regla (sin compararla con el precio). `null` si no es válida. */
export function parsePromoRule(value: unknown): PromoRule | null {
  const raw = (value ?? {}) as Record<string, unknown>;
  switch (raw.kind) {
    case 'bundle':
      return isInt(raw.qty, 2, PROMO_QTY_MAX) && isValidCents(raw.priceCents)
        ? { kind: 'bundle', qty: raw.qty, priceCents: raw.priceCents }
        : null;
    case 'nxm':
      return isInt(raw.take, 2, PROMO_QTY_MAX) && isInt(raw.pay, 1, (raw.take as number) - 1)
        ? { kind: 'nxm', take: raw.take, pay: raw.pay }
        : null;
    case 'percent':
      return isInt(raw.percent, 1, 99) ? { kind: 'percent', percent: raw.percent } : null;
    case 'sale':
      return isValidCents(raw.priceCents) ? { kind: 'sale', priceCents: raw.priceCents } : null;
    default:
      return null;
  }
}

export const sameRule = (a: PromoRule | null | undefined, b: PromoRule | null | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Texto corto para etiquetas: "3 por $25.00", "2x1", "10% menos", "Oferta $15.00". */
export function describePromo(rule: PromoRule): string {
  switch (rule.kind) {
    case 'bundle':
      return `${rule.qty} por ${formatCents(rule.priceCents)}`;
    case 'nxm':
      return `${rule.take}x${rule.pay}`;
    case 'percent':
      return `${rule.percent}% menos`;
    case 'sale':
      return `Oferta ${formatCents(rule.priceCents)}`;
  }
}

/**
 * Si la regla no tiene sentido con el precio normal del producto, regresa el motivo para mostrarlo.
 * Una promoción siempre debe salir más barata que el precio normal.
 */
export function promoRuleError(rule: PromoRule, unitCents: number): string | null {
  switch (rule.kind) {
    case 'bundle':
      return rule.priceCents < rule.qty * unitCents
        ? null
        : `Debe costar menos de ${formatCents(rule.qty * unitCents)}, que es lo que cuestan ${rule.qty} a precio normal.`;
    case 'sale':
      return rule.priceCents < unitCents ? null : `Debe ser menor al precio normal (${formatCents(unitCents)}).`;
    case 'nxm':
    case 'percent':
      return null;
  }
}

export type LinePricing = {
  /** Lo que se cobra por la línea. */
  totalCents: number;
  /** Lo que costaría sin promoción. */
  regularCents: number;
  savingsCents: number;
  /** Aviso para el cajero cuando faltan piezas para aprovechar la promoción. */
  hint: string | null;
};

const more = (n: number) => (n === 1 ? '1 más' : `${n} más`);

/** Calcula una línea de la cuenta. Nunca cobra más que el precio normal. */
export function priceLine(unitCents: number, qty: number, rule: PromoRule | null | undefined): LinePricing {
  const regularCents = unitCents * qty;
  if (!rule) return { totalCents: regularCents, regularCents, savingsCents: 0, hint: null };
  let promoCents = regularCents;
  let hint: string | null = null;
  switch (rule.kind) {
    case 'bundle': {
      const rest = qty % rule.qty;
      promoCents = Math.floor(qty / rule.qty) * rule.priceCents + rest * unitCents;
      if (rest > 0) hint = `Lleva ${more(rule.qty - rest)} para el ${describePromo(rule)}`;
      break;
    }
    case 'nxm': {
      const rest = qty % rule.take;
      promoCents = (Math.floor(qty / rule.take) * rule.pay + rest) * unitCents;
      // En un 2x1 con 1 pieza, la siguiente sale gratis; en un 3x2 con 1 pieza, faltan 2 (una se paga).
      if (rest > 0) {
        hint = rest >= rule.pay ? `¡Lleva ${more(rule.take - rest)} gratis!` : `Lleva ${more(rule.take - rest)} para el ${describePromo(rule)}`;
      }
      break;
    }
    case 'percent':
      promoCents = Math.round((regularCents * (100 - rule.percent)) / 100);
      break;
    case 'sale':
      promoCents = rule.priceCents * qty;
      break;
  }
  const totalCents = Math.min(promoCents, regularCents);
  return { totalCents, regularCents, savingsCents: regularCents - totalCents, hint };
}

/** Lo que escribe la persona en el formulario de promoción. */
export type PromoInput = { qty: string; price: string; take: string; pay: string; percent: string };
export type PromoField = keyof PromoInput;

const wholeNumber = (text: string) => (/^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null);

/** Convierte el formulario en una regla válida para ese precio normal, o dice qué campo corregir. */
export function buildPromoRule(
  kind: PromoKind,
  input: PromoInput,
  unitCents: number,
): { rule: PromoRule } | { field: PromoField; error: string } {
  let rule: PromoRule;
  switch (kind) {
    case 'bundle': {
      const qty = wholeNumber(input.qty);
      if (qty === null || qty < 2 || qty > PROMO_QTY_MAX) return { field: 'qty', error: `Escribe cuántas piezas, de 2 a ${PROMO_QTY_MAX}.` };
      const priceCents = parsePriceToCents(input.price);
      if (!priceCents) return { field: 'price', error: 'Escribe cuánto cuestan todas juntas, por ejemplo 25.' };
      rule = { kind, qty, priceCents };
      break;
    }
    case 'nxm': {
      const take = wholeNumber(input.take);
      if (take === null || take < 2 || take > PROMO_QTY_MAX) return { field: 'take', error: `Escribe cuántas lleva, de 2 a ${PROMO_QTY_MAX}.` };
      const pay = wholeNumber(input.pay);
      if (pay === null || pay < 1 || pay >= take) return { field: 'pay', error: `Escribe cuántas paga: de 1 a ${take - 1}.` };
      rule = { kind, take, pay };
      break;
    }
    case 'percent': {
      const percent = wholeNumber(input.percent.replace('%', ''));
      if (percent === null || percent < 1 || percent > 99) return { field: 'percent', error: 'Escribe un descuento de 1 a 99 %.' };
      rule = { kind, percent };
      break;
    }
    case 'sale': {
      const priceCents = parsePriceToCents(input.price);
      if (!priceCents) return { field: 'price', error: 'Escribe el precio de oferta, por ejemplo 15.50.' };
      rule = { kind, priceCents };
      break;
    }
  }
  const error = promoRuleError(rule, unitCents);
  return error ? { field: kind === 'bundle' || kind === 'sale' ? 'price' : 'percent', error } : { rule };
}

/** Piezas que se usan en el ejemplo del formulario: las justas para que aplique la promoción. */
export const exampleQty = (rule: PromoRule) => (rule.kind === 'bundle' ? rule.qty : rule.kind === 'nxm' ? rule.take : 1);
