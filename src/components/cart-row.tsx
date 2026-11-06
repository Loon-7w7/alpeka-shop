import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { lineTotal, QTY_MAX, type CartItem } from '@/lib/cart';
import { formatCents } from '@/lib/money';
import { colors, radius, space, TOUCH_MIN } from '@/theme';
import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type Props = { item: CartItem; onQty: (id: string, qty: number) => void };

function Step({ icon, label, disabled, onPress }: { icon: IconName; label: string; disabled?: boolean; onPress: () => void }) {
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
  const unit = formatCents(item.priceCents);
  const total = formatCents(lineTotal(item));
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <AppText variant="strong" numberOfLines={2}>{item.name}</AppText>
        <AppText variant="small" numberOfLines={1}>
          {item.qty > 1 ? `${item.qty} × ${unit}` : unit}
          {item.code ? `  ·  ${item.code}` : ''}
        </AppText>
      </View>
      <View style={styles.side}>
        <Text maxFontSizeMultiplier={1.4} style={styles.total}>{total}</Text>
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

const styles = StyleSheet.create({
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
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  step: { width: TOUCH_MIN, height: TOUCH_MIN - 6, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 32, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
});
