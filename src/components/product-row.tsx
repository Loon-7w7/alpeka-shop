import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Product } from '@/db/products';
import { formatCents } from '@/lib/money';
import { makeStyles, useColors, space } from '@/theme';
import { AppText } from './app-text';

type Props = { product: Product; onOpen: (code: string) => void };

export const ProductRow = memo(function ProductRow({ product, onOpen }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const price = formatCents(product.priceCents);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${price}`}
      android_ripple={{ color: colors.primarySoft }}
      onPress={() => onOpen(product.code)}
      style={styles.row}>
      <View style={styles.text}>
        <AppText variant="strong" numberOfLines={2}>{product.name}</AppText>
        <AppText variant="small" numberOfLines={1}>{product.code}</AppText>
      </View>
      <Text maxFontSizeMultiplier={1.4} style={styles.price}>{price}</Text>
    </Pressable>
  );
});

const useStyles = makeStyles((colors) => ({
  row: {
    minHeight: 70,
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
  price: { fontSize: 19, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
}));
