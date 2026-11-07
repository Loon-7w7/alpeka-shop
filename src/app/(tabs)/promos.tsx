import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { PromoRow } from '@/components/promo-row';
import { listPromotions, setPromotionActive, type PromotionListItem } from '@/db/promotions';
import { useLayout } from '@/hooks/use-layout';
import { notify } from '@/lib/notify';
import { makeStyles, useColors, radius, space } from '@/theme';

const keyOf = (item: PromotionListItem) => item.code;
const openPromo = (code: string) => router.push({ pathname: '/promocion/formulario', params: { codigo: code } });
const newPromo = () => router.push('/promocion/formulario');

function summary(items: PromotionListItem[] | null) {
  if (!items?.length) return 'Descuentos que se aplican solos al cobrar';
  const active = items.filter((item) => item.active).length;
  return `${active.toLocaleString('es-MX')} ${active === 1 ? 'activa' : 'activas'} de ${items.length.toLocaleString('es-MX')}`;
}

/** Promociones por producto. Se aplican solas en la Cuenta al escanear o buscar el producto. */
export default function PromosScreen() {
  const colors = useColors();
  const styles = useStyles();
  const db = useSQLiteContext();
  const { insets, gutter, contentWidth } = useLayout();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PromotionListItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Cambia cada vez que la pestaña vuelve a verse (o al tocar Reintentar) para recargar.
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setReloadKey((key) => key + 1);
    }, []),
  );

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      listPromotions(db, query).then(
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

  const toggle = useCallback(
    async (code: string, active: boolean) => {
      // Se cambia en pantalla de inmediato; si no se puede guardar, se regresa como estaba.
      const set = (value: boolean) => setItems((now) => now?.map((item) => (item.code === code ? { ...item, active: value } : item)) ?? now);
      set(active);
      try {
        await setPromotionActive(db, code, active);
        notify(active ? 'Promoción encendida' : 'Promoción apagada');
      } catch {
        set(!active);
        notify('No se pudo cambiar. Inténtalo otra vez.');
      }
    },
    [db],
  );

  const renderItem = useCallback(
    ({ item }: { item: PromotionListItem }) => <PromoRow promo={item} onOpen={openPromo} onToggle={toggle} />,
    [toggle],
  );
  const horizontal = { paddingLeft: insets.left + gutter, paddingRight: insets.right + gutter };
  const searching = query.trim() !== '';

  return (
    <View style={styles.root}>
      <View style={[styles.head, horizontal, { paddingTop: insets.top + space.lg }]}>
        <View style={[styles.headInner, { width: contentWidth }]}>
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <AppText variant="title" accessibilityRole="header">Promociones</AppText>
              <AppText variant="muted">{summary(items)}</AppText>
            </View>
            <Button label="Nueva" icon="plus" compact onPress={newPromo} />
          </View>
          {items?.length || searching ? (
            <View style={styles.search}>
              <Icon name="search" color={colors.muted} />
              <TextInput
                accessibilityLabel="Buscar promoción"
                autoCorrect={false}
                maxFontSizeMultiplier={1.5}
                placeholder="Buscar por producto o código"
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
              />
            </View>
          ) : null}
        </View>
      </View>
      <FlatList
        style={styles.list}
        data={failed ? [] : (items ?? [])}
        keyExtractor={keyOf}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[horizontal, styles.listContent]}
        ListEmptyComponent={
          failed ? (
            <View style={[styles.empty, { width: contentWidth }]}>
              <AppText variant="heading" style={styles.center}>No se pudieron leer las promociones</AppText>
              <Button label="Reintentar" icon="refresh" variant="secondary" onPress={() => setReloadKey((key) => key + 1)} />
            </View>
          ) : items === null ? undefined : searching ? (
            <View style={[styles.empty, { width: contentWidth }]}>
              <AppText variant="heading" style={styles.center}>No hay promociones con “{query.trim()}”</AppText>
            </View>
          ) : (
            <View style={[styles.empty, { width: contentWidth }]}>
              <AppText variant="heading" style={styles.center}>Aún no hay promociones</AppText>
              <AppText variant="muted" style={styles.center}>
                Crea una para un producto (3 por $25, 2x1, 10% menos u oferta) y se aplicará sola al cobrar.
              </AppText>
              <Button label="Crear promoción" icon="plus" variant="secondary" onPress={newPromo} />
            </View>
          )
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
}));
