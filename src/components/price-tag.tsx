import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLayout } from '@/hooks/use-layout';
import { formatCents } from '@/lib/money';
import { colors, radius, space } from '@/theme';
import { AppText } from './app-text';

export function PriceTag({ cents }: { cents: number }) {
  const { width, height, compact, landscape } = useLayout();
  const [tagWidth, setTagWidth] = useState(0);
  const price = formatCents(cents);
  // El tamaño se calcula con el ancho real para que el precio nunca se corte, sin importar cuántos dígitos tenga.
  const largest = Math.max(56, Math.min(width * 0.2, landscape ? height * 0.2 : 96));
  const fits = (tagWidth - space.xl * 2) / (price.length * 0.62);
  const size = tagWidth > 0 ? Math.min(largest, fits) : largest;
  return (
    <View
      style={[styles.tag, compact && styles.tagCompact]}
      onLayout={(event) => setTagWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Cobrar ${price} pesos mexicanos`}>
      <View style={styles.hole} />
      <AppText variant="strong">Cobrar</AppText>
      <Text
        adjustsFontSizeToFit
        allowFontScaling={false}
        minimumFontScale={0.6}
        numberOfLines={1}
        style={[styles.price, { fontSize: size, lineHeight: size * 1.12 }]}>
        {price}
      </Text>
      <AppText style={styles.currency}>pesos mexicanos</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    backgroundColor: colors.amber,
    borderRadius: radius.xl,
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.xxl + space.sm,
    paddingBottom: space.xl,
  },
  tagCompact: { paddingTop: space.xl + space.sm, paddingBottom: space.md },
  hole: {
    position: 'absolute',
    top: 12,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.ground,
  },
  price: {
    alignSelf: 'stretch',
    textAlign: 'center',
    color: colors.ink,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  currency: { fontSize: 14, fontWeight: '500' },
});
