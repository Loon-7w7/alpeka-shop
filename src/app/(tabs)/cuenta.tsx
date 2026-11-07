import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { CartRow } from '@/components/cart-row';
import { Field } from '@/components/field';
import { PriceEntry } from '@/components/price-entry';
import { useCart } from '@/hooks/use-cart';
import { useLayout } from '@/hooks/use-layout';
import { cartCount, cartSavings, cartTotal, changeFor, LOOSE_NAME, type CartItem } from '@/lib/cart';
import { centsToInput, formatCents, parsePriceToCents } from '@/lib/money';
import { makeStyles, radius, space } from '@/theme';

const BILLS = [2000, 5000, 10000, 20000, 50000];
const articles = (n: number) => (n === 1 ? '1 artículo' : `${n.toLocaleString('es-MX')} artículos`);
const keyOf = (item: CartItem) => item.id;

export default function CartScreen() {
  const styles = useStyles();
  const { items, ready, add, setQty, clear } = useCart();
  const { insets, gutter, contentWidth } = useLayout();
  const [looseOpen, setLooseOpen] = useState(false);
  const [paid, setPaid] = useState('');

  const total = cartTotal(items);
  const savings = cartSavings(items);
  const count = cartCount(items);
  const paidCents = parsePriceToCents(paid);
  const change = paidCents === null ? null : changeFor(total, paidCents);

  // Al vaciar la cuenta también se olvida con cuánto pagó el cliente anterior.
  if (items.length === 0 && paid !== '') setPaid('');

  const confirmClear = () => {
    Alert.alert('¿Empezar una cuenta nueva?', 'Se quitarán todos los artículos de esta cuenta. Tus productos no cambian.', [
      { text: 'Seguir con esta', style: 'cancel' },
      { text: 'Cuenta nueva', style: 'destructive', onPress: clear },
    ]);
  };

  const renderItem = useCallback(({ item }: { item: CartItem }) => <CartRow item={item} onQty={setQty} />, [setQty]);
  const horizontal = { paddingLeft: insets.left + gutter, paddingRight: insets.right + gutter };
  const bills = BILLS.filter((bill) => bill > total);

  return (
    <View style={styles.root}>
      <View style={[styles.head, horizontal, { paddingTop: insets.top + space.lg }]}>
        <View style={[styles.headInner, { width: contentWidth }]}>
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <AppText variant="title" accessibilityRole="header">Cuenta</AppText>
              <AppText variant="muted">{articles(count)}</AppText>
            </View>
            {items.length ? <Button label="Cuenta nueva" icon="trash" variant="secondary" compact onPress={confirmClear} /> : null}
          </View>

          <View
            style={styles.totalCard}
            accessible
            accessibilityLabel={`Total ${formatCents(total)}${savings ? `, ahorro por promociones ${formatCents(savings)}` : ''}`}>
            <Text maxFontSizeMultiplier={1.3} style={styles.totalLabel}>Total</Text>
            <Text maxFontSizeMultiplier={1.3} adjustsFontSizeToFit numberOfLines={1} style={styles.totalValue}>
              {formatCents(total)}
            </Text>
            {savings > 0 ? (
              <Text maxFontSizeMultiplier={1.3} style={styles.changeLine}>Ahorro con promociones: {formatCents(savings)}</Text>
            ) : null}
            {change !== null && total > 0 ? (
              <Text maxFontSizeMultiplier={1.3} style={styles.changeLine}>
                {change >= 0 ? `Cambio: ${formatCents(change)}` : `Faltan: ${formatCents(-change)}`}
              </Text>
            ) : null}
          </View>

          <View style={styles.actions}>
            <Button label="Escanear productos" icon="scan" onPress={() => router.push('/cuenta/escanear')} />
            <View style={styles.actionRow}>
              <View style={styles.action}>
                <Button label="Buscar" icon="search" variant="secondary" onPress={() => router.push('/cuenta/buscar')} />
              </View>
              <View style={styles.action}>
                <Button label="Precio suelto" icon="plus" variant="secondary" onPress={() => setLooseOpen(true)} />
              </View>
            </View>
          </View>
        </View>
      </View>

      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={keyOf}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[horizontal, styles.listContent]}
        ListEmptyComponent={
          ready ? (
            <View style={styles.empty}>
              <AppText variant="heading" style={styles.center}>La cuenta está vacía</AppText>
              <AppText variant="muted" style={styles.center}>
                Escanea o busca productos para sumarlos. Esto no cambia tus productos ni tus precios guardados.
              </AppText>
            </View>
          ) : undefined
        }
        ListFooterComponent={
          items.length ? (
            <View style={styles.payment}>
              <Field
                large
                prefix="$"
                label="¿Con cuánto paga?"
                placeholder="0.00"
                keyboardType="decimal-pad"
                returnKeyType="done"
                value={paid}
                onChangeText={setPaid}
                error={paid.trim() && paidCents === null ? 'Escribe una cantidad válida.' : undefined}
              />
              <View style={styles.bills}>
                <Button label="Exacto" variant="secondary" compact onPress={() => setPaid(centsToInput(total))} />
                {bills.map((bill) => (
                  <Button
                    key={bill}
                    label={formatCents(bill).replace('.00', '')}
                    variant="secondary"
                    compact
                    onPress={() => setPaid(centsToInput(bill))}
                  />
                ))}
              </View>
              {change !== null ? (
                <View style={[styles.changeCard, change < 0 && styles.changeCardShort]} accessibilityLiveRegion="polite">
                  <AppText variant="strong">{change >= 0 ? 'Cambio a devolver' : 'Falta por pagar'}</AppText>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.changeValue, change < 0 && styles.changeValueShort]}>
                    {formatCents(Math.abs(change))}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : undefined
        }
      />

      <PriceEntry
        visible={looseOpen}
        title={LOOSE_NAME}
        subtitle="Para algo sin código o que no está registrado."
        onClose={() => setLooseOpen(false)}
        onSubmit={({ name, priceCents }) => {
          setLooseOpen(false);
          add({ code: null, name: name || LOOSE_NAME, priceCents });
        }}
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
  totalCard: { borderRadius: radius.lg, backgroundColor: colors.primary, paddingVertical: space.md, paddingHorizontal: space.lg },
  totalLabel: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
  totalValue: { color: colors.onPrimary, fontSize: 40, lineHeight: 48, fontWeight: '800', fontVariant: ['tabular-nums'] },
  changeLine: { color: colors.onPrimary, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  actions: { gap: space.sm },
  actionRow: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
  list: { flex: 1 },
  listContent: { alignItems: 'stretch', paddingBottom: space.xl, alignSelf: 'center', width: '100%', maxWidth: 600 },
  empty: { alignSelf: 'stretch', gap: space.md, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface },
  center: { textAlign: 'center' },
  payment: { gap: space.md, paddingTop: space.lg },
  bills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  changeCard: { gap: space.xs, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  changeCardShort: { backgroundColor: colors.dangerSoft },
  changeValue: { color: colors.ink, fontSize: 32, lineHeight: 40, fontWeight: '800', fontVariant: ['tabular-nums'] },
  changeValueShort: { color: colors.danger },
}));
