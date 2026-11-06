import { useSQLiteContext } from 'expo-sqlite';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getSetting, setSetting } from '@/db/settings';
import { addItem, parseCart, removeItem, serializeCart, setQty, type Cart } from '@/lib/cart';

type CartContext = {
  items: Cart;
  /** `false` mientras se lee la cuenta guardada. */
  ready: boolean;
  add: (item: { code: string | null; name: string; priceCents: number }) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const Context = createContext<CartContext | null>(null);

/** Guarda la cuenta en el teléfono para que siga ahí si se cierra la app. No toca la tabla de productos. */
export function CartProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [items, setItems] = useState<Cart>([]);
  const [ready, setReady] = useState(false);
  // Las escrituras van en fila para que una vieja no pise a una nueva.
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    let current = true;
    getSetting(db, 'cart')
      .then((text) => {
        // Si el cajero agregó algo antes de terminar de leer, se conserva lo nuevo.
        if (current) setItems((now) => (now.length ? now : parseCart(text)));
      })
      .catch(() => undefined)
      .finally(() => {
        if (current) setReady(true);
      });
    return () => {
      current = false;
    };
  }, [db]);

  useEffect(() => {
    if (!ready) return;
    const text = serializeCart(items);
    // Si no se puede guardar, la cuenta sigue funcionando en memoria.
    writes.current = writes.current.then(() => setSetting(db, 'cart', text)).catch(() => undefined);
  }, [db, items, ready]);

  const add = useCallback<CartContext['add']>((item) => setItems((now) => addItem(now, item)), []);
  const changeQty = useCallback((id: string, qty: number) => setItems((now) => setQty(now, id, qty)), []);
  const remove = useCallback((id: string) => setItems((now) => removeItem(now, id)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, ready, add, setQty: changeQty, remove, clear }),
    [items, ready, add, changeQty, remove, clear],
  );
  return <Context value={value}>{children}</Context>;
}

export function useCart(): CartContext {
  const value = use(Context);
  if (!value) throw new Error('useCart debe usarse dentro de CartProvider');
  return value;
}
