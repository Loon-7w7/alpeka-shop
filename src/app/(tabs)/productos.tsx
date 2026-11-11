import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { NoteRow } from '@/components/note-row';
import { ProductRow } from '@/components/product-row';
import { countNotes, listNotes, noteKey, type PriceNote } from '@/db/notes';
import { countProducts, searchProducts, SEARCH_LIMIT, type Product } from '@/db/products';
import { useLayout } from '@/hooks/use-layout';
import { shareProducts } from '@/services/backup';
import { BackupError } from '@/services/backup-format';
import { makeStyles, useColors, radius, space } from '@/theme';

type Mode = 'productos' | 'notas';

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n.toLocaleString('es-MX')} ${many}`);
const keyOf = (item: Product) => item.code;
const noteKeyOf = (item: PriceNote) => noteKey(item.name);
const openProduct = (code: string) => router.push({ pathname: '/producto/[codigo]', params: { codigo: code } });
const openNote = (key: string) => router.push({ pathname: '/nota/formulario', params: { clave: key } });

export default function ProductsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const db = useSQLiteContext();
  const { insets, gutter, contentWidth } = useLayout();
  const [mode, setMode] = useState<Mode>('productos');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Product[] | null>(null);
  const [notes, setNotes] = useState<PriceNote[] | null>(null);
  const [total, setTotal] = useState(0);
  const [noteTotal, setNoteTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  // Cambia cada vez que la pestaña vuelve a verse (o al tocar Reintentar) para recargar con la búsqueda actual.
  const [reloadKey, setReloadKey] = useState(0);
  const [sharing, setSharing] = useState(false);
  const isNotes = mode === 'notas';

  useFocusEffect(
    useCallback(() => {
      setReloadKey((key) => key + 1);
      // Los contadores son solo informativos: si fallan se conserva el último valor.
      countProducts(db).then(setTotal, () => undefined);
      countNotes(db).then(setNoteTotal, () => undefined);
    }, [db]),
  );

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      // Una búsqueda vieja que termina tarde no debe pisar la del texto actual.
      const search = isNotes
        ? listNotes(db, query).then((found) => {
            if (current) setNotes(found);
          })
        : searchProducts(db, query).then((found) => {
            if (current) setItems(found);
          });
      search.then(
        () => {
          if (current) setFailed(false);
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
  }, [db, query, reloadKey, isNotes]);

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

  const add = () =>
    router.push({ pathname: isNotes ? '/nota/formulario' : '/producto/formulario', params: { nombre: query.trim() } });
  const renderItem = useCallback(({ item }: { item: Product }) => <ProductRow product={item} onOpen={openProduct} />, []);
  const renderNote = useCallback(({ item }: { item: PriceNote }) => <NoteRow note={item} onOpen={openNote} />, []);

  const horizontal = { paddingLeft: insets.left + gutter, paddingRight: insets.right + gutter };
  const trimmed = query.trim();

  const failedView = (
    <View style={[styles.empty, { width: contentWidth }]}>
      <AppText variant="heading" style={styles.center}>
        {isNotes ? 'No se pudieron leer las notas' : 'No se pudieron leer los productos'}
      </AppText>
      <AppText variant="muted" style={styles.center}>Tus precios siguen guardados. Inténtalo otra vez.</AppText>
      <Button label="Reintentar" icon="refresh" variant="secondary" onPress={() => setReloadKey((key) => key + 1)} />
    </View>
  );

  const listProps = {
    style: styles.list,
    initialNumToRender: 14,
    maxToRenderPerBatch: 14,
    windowSize: 7,
    removeClippedSubviews: true,
    keyboardShouldPersistTaps: 'handled' as const,
    keyboardDismissMode: 'on-drag' as const,
    contentContainerStyle: [horizontal, styles.listContent],
  };

  return (
    <View style={styles.root}>
      <View style={[styles.head, horizontal, { paddingTop: insets.top + space.lg }]}>
        <View style={[styles.headInner, { width: contentWidth }]}>
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <AppText variant="title" accessibilityRole="header">Productos</AppText>
              <AppText variant="muted">
                {isNotes ? plural(noteTotal, 'nota de precio', 'notas de precio') : plural(total, 'producto', 'productos')}
              </AppText>
            </View>
            <View style={styles.titleActions}>
              {total + noteTotal > 0 ? (
                <Button label="Compartir" icon="share" variant="secondary" compact loading={sharing} disabled={sharing} onPress={share} />
              ) : null}
              <Button label="Agregar" icon="plus" compact onPress={add} />
            </View>
          </View>

          <View style={styles.segment} accessibilityRole="tablist">
            {(['productos', 'notas'] as const).map((option) => {
              const selected = option === mode;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setMode(option)}
                  style={[styles.segmentItem, selected && styles.segmentSelected]}>
                  <AppText variant="strong" style={selected ? styles.segmentTextSelected : styles.segmentText}>
                    {option === 'productos' ? 'Con código' : 'Notas (sin código)'}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.search}>
            <Icon name="search" color={colors.muted} />
            <TextInput
              accessibilityLabel={isNotes ? 'Buscar nota' : 'Buscar producto'}
              autoCorrect={false}
              maxFontSizeMultiplier={1.5}
              placeholder={isNotes ? 'Buscar por nombre' : 'Buscar por nombre o código'}
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
            />
          </View>
        </View>
      </View>

      {isNotes ? (
        <FlatList
          {...listProps}
          data={failed ? [] : (notes ?? [])}
          keyExtractor={noteKeyOf}
          renderItem={renderNote}
          ListEmptyComponent={
            failed ? failedView : notes === null ? undefined : (
              <View style={[styles.empty, { width: contentWidth }]}>
                <AppText variant="heading" style={styles.center}>
                  {trimmed ? `No hay notas con “${trimmed}”` : 'Aún no hay notas'}
                </AppText>
                <AppText variant="muted" style={styles.center}>
                  Anota aquí el precio de lo que no tiene código, como verduras por kilo. Solo es para consultar: al cobrar usa
                  “Precio suelto” en la Cuenta.
                </AppText>
                <Button label="Agregar nota" variant="secondary" onPress={add} />
              </View>
            )
          }
        />
      ) : (
        <FlatList
          {...listProps}
          data={failed ? [] : (items ?? [])}
          keyExtractor={keyOf}
          renderItem={renderItem}
          ListEmptyComponent={
            failed ? failedView : items === null ? undefined : (
              <View style={[styles.empty, { width: contentWidth }]}>
                <AppText variant="heading" style={styles.center}>
                  {trimmed ? `No hay productos con “${trimmed}”` : 'Aún no hay productos'}
                </AppText>
                <AppText variant="muted" style={styles.center}>
                  {trimmed
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
      )}
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
  segment: {
    flexDirection: 'row',
    gap: space.xs,
    padding: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  segmentItem: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.md - 4,
  },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { color: colors.muted, textAlign: 'center' },
  segmentTextSelected: { color: colors.onPrimary, textAlign: 'center' },
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
