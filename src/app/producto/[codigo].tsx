import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Page } from '@/components/page';
import { PriceTag } from '@/components/price-tag';
import { getProduct, type Product } from '@/db/products';
import { useLayout } from '@/hooks/use-layout';
import { shortDate } from '@/lib/dates';
import { colors, radius, space } from '@/theme';

export default function ProductScreen() {
  const { codigo } = useLocalSearchParams<{ codigo: string }>();
  const db = useSQLiteContext();
  const { landscape } = useLayout();
  const [product, setProduct] = useState<Product | null | undefined>();

  useFocusEffect(
    useCallback(() => {
      let current = true;
      getProduct(db, codigo).then((found) => {
        if (current) setProduct(found);
      });
      return () => {
        current = false;
      };
    }, [db, codigo]),
  );

  if (product === undefined) return <View style={styles.blank} />;

  if (product === null) {
    return (
      <Page top={false} bottom>
        <AppText variant="heading">Este producto ya no está guardado</AppText>
        <Button label="Escanear otro" icon="scan" onPress={() => router.dismissTo('/')} />
      </Page>
    );
  }

  return (
    <Page top={false} bottom>
      <View style={styles.status}>
        <View style={styles.statusIcon}>
          <Icon name="check" size={16} color={colors.onPrimary} />
        </View>
        <AppText style={styles.statusText}>Producto encontrado</AppText>
      </View>
      <AppText accessibilityRole="header" style={styles.name}>{product.name}</AppText>
      <View style={landscape ? styles.columns : styles.stack}>
        <View style={landscape ? styles.column : undefined}>
          <PriceTag cents={product.priceCents} />
        </View>
        <View style={landscape ? styles.column : undefined}>
          <View style={styles.details}>
            <View style={[styles.detail, styles.detailLine]}>
              <AppText variant="muted">Código</AppText>
              <AppText selectable style={styles.detailValue}>{product.code}</AppText>
            </View>
            <View style={styles.detail}>
              <AppText variant="muted">Último cambio</AppText>
              <AppText style={styles.detailValue}>{shortDate(product.updatedAt)}</AppText>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        <Button label="Escanear otro" icon="scan" large onPress={() => router.dismissTo('/')} />
        <Button
          label="Cambiar precio"
          icon="edit"
          variant="secondary"
          onPress={() => router.push({ pathname: '/producto/formulario', params: { codigo: product.code, modo: 'editar' } })}
        />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: colors.ground },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statusIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  statusText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  name: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  stack: { gap: space.lg },
  columns: { flexDirection: 'row', gap: space.lg },
  column: { flex: 1, minWidth: 0 },
  details: { borderRadius: radius.lg, backgroundColor: colors.surface, paddingHorizontal: space.lg },
  detail: {
    minHeight: 48,
    paddingVertical: space.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  detailLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  detailValue: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  actions: { marginTop: 'auto', gap: space.sm + 2 },
});
