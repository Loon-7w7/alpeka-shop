import { isValidCents } from './money.ts';

/**
 * La cuenta del cajero: solo suma precios. No cambia productos ni inventario.
 * El precio se copia al agregar, así la cuenta no cambia si alguien edita el producto mientras tanto.
 */
export type CartItem = {
  id: string;
  /** Código de barras. `null` en un precio suelto (sin código). */
  code: string | null;
  name: string;
  priceCents: number;
  qty: number;
};

export type Cart = readonly CartItem[];

export const QTY_MAX = 999;
export const LOOSE_NAME = 'Precio suelto';

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

/**
 * Agrega un producto. Si ya está en la cuenta con el mismo código y precio, sube la cantidad.
 * Los precios sueltos siempre van en su propia línea.
 */
export function addItem(cart: Cart, item: { code: string | null; name: string; priceCents: number }, id = newId()): Cart {
  if (!isValidCents(item.priceCents)) return cart;
  const index = item.code === null ? -1 : cart.findIndex((line) => line.code === item.code && line.priceCents === item.priceCents);
  if (index >= 0) return setQty(cart, cart[index].id, cart[index].qty + 1);
  const name = item.name.trim() || (item.code ?? LOOSE_NAME);
  return [...cart, { id, code: item.code, name, priceCents: item.priceCents, qty: 1 }];
}

/** Cambia la cantidad de una línea. Con 0 o menos, la quita. */
export function setQty(cart: Cart, id: string, qty: number): Cart {
  if (!Number.isInteger(qty)) return cart;
  if (qty <= 0) return removeItem(cart, id);
  const capped = Math.min(qty, QTY_MAX);
  return cart.map((line) => (line.id === id ? { ...line, qty: capped } : line));
}

export function removeItem(cart: Cart, id: string): Cart {
  return cart.filter((line) => line.id !== id);
}

export const lineTotal = (line: CartItem) => line.priceCents * line.qty;
export const cartTotal = (cart: Cart) => cart.reduce((sum, line) => sum + lineTotal(line), 0);
export const cartCount = (cart: Cart) => cart.reduce((sum, line) => sum + line.qty, 0);

/** Positivo: cambio que se devuelve. Negativo: lo que falta por pagar. */
export const changeFor = (totalCents: number, paidCents: number) => paidCents - totalCents;

export function serializeCart(cart: Cart): string {
  return JSON.stringify({ v: 1, items: cart });
}

/** Lee la cuenta guardada. Si una línea está dañada se descarta solo esa; si todo está mal, regresa vacía. */
export function parseCart(text: string | null): CartItem[] {
  if (!text) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const items = (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: CartItem[] = [];
  for (const raw of items) {
    const line = (raw ?? {}) as Partial<CartItem>;
    if (typeof line.id !== 'string' || !line.id || seen.has(line.id)) continue;
    if (line.code !== null && typeof line.code !== 'string') continue;
    if (typeof line.name !== 'string' || !isValidCents(line.priceCents)) continue;
    if (!Number.isInteger(line.qty) || (line.qty as number) < 1) continue;
    seen.add(line.id);
    result.push({
      id: line.id,
      code: line.code,
      name: line.name,
      priceCents: line.priceCents,
      qty: Math.min(line.qty as number, QTY_MAX),
    });
  }
  return result;
}
