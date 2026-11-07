import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { linePricing, QTY_MAX, type CartItem } from '@/lib/cart';
import { formatCents } from '@/lib/money';
import { describePromo } from '@/lib/promo';
import { makeStyles, useColors, radius, space, TOUCH_MIN } from '@/theme';
import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type Props = { item: CartItem; onQty: (id: string, qty: number) => void };

function Step({ icon, label, disabled, onPress }: { icon: IconName; label: string; disabled?: boolean; onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.step, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={20} color={icon === 'trash' ? colors.danger : colors.ink} />
    </Pressable>
  );
}

export const CartRow = memo(function CartRow({ item, onQty }: Props) {
  const styles = useStyles();
  const unit = formatCents(item.priceCents);
  const pricing = linePricing(item);
  const total = formatCents(pricing.totalCents);
  const saved = pricing.savingsCents > 0;
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <AppText variant="strong" numberOfLines={2}>{item.name}</AppText>
        <AppText variant="small" numberOfLines={1}>
          {item.qty > 1 ? `${item.qty} × ${unit}` : unit}
          {item.code ? `  ·  ${item.code}` : ''}
        </AppText>
        {item.promo ? (
          <View style={styles.promoRow}>
            <View style={styles.badge}>
              <Text maxFontSizeMultiplier={1.3} style={styles.badgeText}>{describePromo(item.promo)}</Text>
            </View>
            {saved ? (
              <Text maxFontSizeMultiplier={1.4} style={styles.saved}>Ahorras {formatCents(pricing.savingsCents)}</Text>
            ) : null}
          </View>
        ) : null}
        {pricing.hint ? <AppText variant="small" style={styles.hint}>{pricing.hint}</AppText> : null}
      </View>
      <View style={styles.side}>
        {saved ? (
          <Text
            maxFontSizeMultiplier={1.4}
            style={styles.regular}
            accessibilityLabel={`Precio normal ${formatCents(pricing.regularCents)}`}>
            {formatCents(pricing.regularCents)}
          </Text>
        ) : null}
        <Text maxFontSizeMultiplier={1.4} style={styles.total} accessibilityLabel={saved ? `Con promoción ${total}` : undefined}>
          {total}
        </Text>
        <View style={styles.stepper}>
          <Step
            icon={item.qty > 1 ? 'minus' : 'trash'}
            label={item.qty > 1 ? `Quitar uno de ${item.name}` : `Quitar ${item.name} de la cuenta`}
            onPress={() => onQty(item.id, item.qty - 1)}
          />
          <Text maxFontSizeMultiplier={1.4} style={styles.qty} accessibilityLabel={`Cantidad ${item.qty}`}>{item.qty}</Text>
          <Step
            icon="plus"
            label={`Agregar otro ${item.name}`}
            disabled={item.qty >= QTY_MAX}
            onPress={() => onQty(item.id, item.qty + 1)}
          />
        </View>
      </View>
    </View>
  );
});

const useStyles = makeStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  side: { alignItems: 'flex-end', gap: space.xs },
  total: { fontSize: 18, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  regular: { fontSize: 14, color: colors.muted, textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] },
  promoRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: 2 },
  badge: { borderRadius: 6, backgroundColor: colors.highlight, paddingHorizontal: space.sm, paddingVertical: 2 },
  badgeText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },
  saved: { color: colors.accent, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  hint: { color: colors.accent, fontWeight: '600' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  step: { width: TOUCH_MIN, height: TOUCH_MIN - 6, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 32, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
}));
