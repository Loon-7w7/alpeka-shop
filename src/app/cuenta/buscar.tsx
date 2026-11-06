import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ProductRow } from '@/components/product-row';
import { searchProducts, SEARCH_LIMIT, type Product } from '@/db/products';
import { useCart } from '@/hooks/use-cart';
import { useLayout } from '@/hooks/use-layout';
import { cartCount, cartTotal } from '@/lib/cart';
import { formatCents } from '@/lib/money';
import { notify } from '@/lib/notify';
import { colors, radius, space } from '@/theme';

const keyOf = (item: Product) => item.code;

/** Busca en los productos guardados y suma el que se toque. Solo lee la lista; no la cambia. */
export default function CartSearchScreen() {
  const db = useSQLiteContext();
  const { items: cart, add } = useCart();
  const { insets, gutter, contentWidth } = useLayout();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      searchProducts(db, query).then(
        (found) => {
          if (!current) return;
          setItems(found);
          setFailed(false);
        },
        () => {
          if (current) setFailed(true);
        },
      );
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [db, query, reloadKey]);

  const pick = useCallback(
    (code: string) => {
      const product = items?.find((item) => item.code === code);
      if (!product) return;
      add({ code: product.code, name: product.name, priceCents: product.priceCents });
      notify(`Sumado: ${product.name}`);
    },
    [items, add],
  );

  const renderItem = useCallback(({ item }: { item: Product }) => <ProductRow product={item} onOpen={pick} />, [pick]);
  const horizontal = { paddingLeft: insets.left + gutter, paddingRight: insets.right + gutter };

  return (
    <View style={styles.root}>
      <View style={[styles.head, horizontal]}>
        <View style={[styles.headInner, { width: contentWidth }]}>
          <View style={styles.search}>
            <Icon name="search" color={colors.muted} />
            <TextInput
              autoFocus
              accessibilityLabel="Buscar producto para sumar"
              autoCorrect={false}
              maxFontSizeMultiplier={1.5}
              placeholder="Buscar por nombre o código"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
            />
          </View>
          <AppText variant="muted" accessibilityLiveRegion="polite">
            Toca un producto para sumarlo · Total {formatCents(cartTotal(cart))} ({cartCount(cart)})
          </AppText>
        </View>
      </View>
      <FlatList
        style={styles.list}
        data={failed ? [] : (items ?? [])}
        keyExtractor={keyOf}
        renderItem={renderItem}
        initialNumToRender={14}
        maxToRenderPerBatch={14}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[horizontal, styles.listContent, { paddingBottom: insets.bottom + space.lg }]}
        ListEmptyComponent={
          failed ? (
            <View style={styles.empty}>
              <AppText variant="heading" style={styles.center}>No se pudieron leer los productos</AppText>
              <Button label="Reintentar" icon="refresh" variant="secondary" onPress={() => setReloadKey((key) => key + 1)} />
            </View>
          ) : items === null ? undefined : (
            <View style={styles.empty}>
              <AppText variant="heading" style={styles.center}>
                {query.trim() ? `No hay productos con “${query.trim()}”` : 'Aún no hay productos'}
              </AppText>
              <AppText variant="muted" style={styles.center}>Si no está registrado, usa “Precio suelto” en la cuenta.</AppText>
            </View>
          )
        }
        ListFooterComponent={
          items && items.length >= SEARCH_LIMIT ? (
            <AppText variant="small" style={[styles.center, styles.footer]}>
              Se muestran los primeros {SEARCH_LIMIT}. Escribe para buscar uno en específico.
            </AppText>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  head: { alignItems: 'center', paddingTop: space.sm, paddingBottom: space.md },
  headInner: { gap: space.sm },
  search: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md + 2,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, color: colors.ink, paddingVertical: space.sm },
  list: { flex: 1 },
  listContent: { alignItems: 'stretch', alignSelf: 'center', width: '100%', maxWidth: 600 },
  empty: { alignSelf: 'stretch', gap: space.md, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface },
  center: { textAlign: 'center' },
  footer: { padding: space.lg },
});
