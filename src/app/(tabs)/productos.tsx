import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ProductRow } from '@/components/product-row';
import { countProducts, searchProducts, SEARCH_LIMIT, type Product } from '@/db/products';
import { useLayout } from '@/hooks/use-layout';
import { shareProducts } from '@/services/backup';
import { BackupError } from '@/services/backup-format';
import { makeStyles, useColors, radius, space } from '@/theme';

const plural = (n: number) => (n === 1 ? '1 producto' : `${n.toLocaleString('es-MX')} productos`);
const keyOf = (item: Product) => item.code;
const openProduct = (code: string) => router.push({ pathname: '/producto/[codigo]', params: { codigo: code } });

export default function ProductsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const db = useSQLiteContext();
  const { insets, gutter, contentWidth } = useLayout();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Product[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  // Cambia cada vez que la pestaña vuelve a verse (o al tocar Reintentar) para recargar con la búsqueda actual.
  const [reloadKey, setReloadKey] = useState(0);
  const [sharing, setSharing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setReloadKey((key) => key + 1);
      // El contador es solo informativo: si falla se conserva el último valor.
      countProducts(db).then(setTotal, () => undefined);
    }, [db]),
  );

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      searchProducts(db, query).then(
        (found) => {
          // Una búsqueda vieja que termina tarde no debe pisar la del texto actual.
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

  // Abre el menú de compartir (WhatsApp, correo, Bluetooth…). El otro teléfono lo abre y combina la lista.
  const share = async () => {
    setSharing(true);
    try {
      await shareProducts(db);
    } catch (error) {
      Alert.alert('No se pudo compartir', error instanceof BackupError ? error.message : 'Algo salió mal. Inténtalo otra vez.');
    } finally {
      setSharing(false);
    }
  };

  const add = () => router.push({ pathname: '/producto/formulario', params: { nombre: query.trim() } });
  const renderItem = useCallback(({ item }: { item: Product }) => <ProductRow product={item} onOpen={openProduct} />, []);

  const horizontal = { paddingLeft: insets.left + gutter, paddingRight: insets.right + gutter };

  return (
    <View style={styles.root}>
      <View style={[styles.head, horizontal, { paddingTop: insets.top + space.lg }]}>
        <View style={[styles.headInner, { width: contentWidth }]}>
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <AppText variant="title" accessibilityRole="header">Productos</AppText>
              <AppText variant="muted">{plural(total)}</AppText>
            </View>
            <View style={styles.titleActions}>
              {total > 0 ? (
                <Button label="Compartir" icon="share" variant="secondary" compact loading={sharing} disabled={sharing} onPress={share} />
              ) : null}
              <Button label="Agregar" icon="plus" compact onPress={add} />
            </View>
          </View>
          <View style={styles.search}>
            <Icon name="search" color={colors.muted} />
            <TextInput
              accessibilityLabel="Buscar producto"
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
        contentContainerStyle={[horizontal, styles.listContent]}
        ListEmptyComponent={
          failed ? (
            <View style={[styles.empty, { width: contentWidth }]}>
              <AppText variant="heading" style={styles.center}>No se pudieron leer los productos</AppText>
              <AppText variant="muted" style={styles.center}>Tus precios siguen guardados. Inténtalo otra vez.</AppText>
              <Button label="Reintentar" icon="refresh" variant="secondary" onPress={() => setReloadKey((key) => key + 1)} />
            </View>
          ) : items === null ? undefined : (
            <View style={[styles.empty, { width: contentWidth }]}>
              <AppText variant="heading" style={styles.center}>
                {query.trim() ? `No hay productos con “${query.trim()}”` : 'Aún no hay productos'}
              </AppText>
              <AppText variant="muted" style={styles.center}>
                {query.trim()
                  ? 'Revisa cómo lo escribiste o agrégalo como producto nuevo.'
                  : 'Escanea un código o toca Agregar para guardar el primero.'}
              </AppText>
              <Button label="Agregar producto" variant="secondary" onPress={add} />
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

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.ground },
  head: { alignItems: 'center', paddingBottom: space.md },
  headInner: { gap: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' },
  titleText: { flexShrink: 1 },
  titleActions: { flexDirection: 'row', gap: space.sm },
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
  listContent: { alignItems: 'stretch', paddingBottom: space.lg, alignSelf: 'center', width: '100%', maxWidth: 600 },
  empty: { alignSelf: 'center', gap: space.md, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface },
  center: { textAlign: 'center' },
  footer: { padding: space.lg },
}));
