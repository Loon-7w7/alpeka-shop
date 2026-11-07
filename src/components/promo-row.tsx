import { memo } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { PromotionListItem } from '@/db/promotions';
import { formatCents } from '@/lib/money';
import { describePromo } from '@/lib/promo';
import { makeStyles, useColors, space } from '@/theme';
import { AppText } from './app-text';

type Props = {
  promo: PromotionListItem;
  onOpen: (code: string) => void;
  onToggle: (code: string, active: boolean) => void;
};

export const PromoRow = memo(function PromoRow({ promo, onOpen, onToggle }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const label = describePromo(promo.rule);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${promo.name}, ${label}${promo.active ? '' : ', apagada'}. Toca para cambiarla`}
        android_ripple={{ color: colors.primarySoft }}
        onPress={() => onOpen(promo.code)}
        style={styles.main}>
        <AppText variant="strong" numberOfLines={2}>{promo.name}</AppText>
        <View style={styles.meta}>
          <View style={[styles.badge, !promo.active && styles.badgeOff]}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.badgeText, !promo.active && styles.badgeTextOff]}>{label}</Text>
          </View>
          <AppText variant="small" numberOfLines={1} style={styles.normal}>
            {promo.active ? `Normal ${formatCents(promo.priceCents)}` : 'Apagada'}
          </AppText>
        </View>
      </Pressable>
      <Switch
        accessibilityLabel={`Promoción de ${promo.name}`}
        value={promo.active}
        onValueChange={(value) => onToggle(promo.code, value)}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={promo.active ? colors.accent : colors.surface}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
});

const useStyles = makeStyles((colors) => ({
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingRight: space.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  main: { flex: 1, minWidth: 0, gap: space.xs, paddingLeft: space.lg, paddingVertical: space.sm + 2 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  badge: { borderRadius: 6, backgroundColor: colors.highlight, paddingHorizontal: space.sm, paddingVertical: 2 },
  badgeOff: { backgroundColor: colors.primarySoft },
  badgeText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },
  badgeTextOff: { color: colors.ink },
  normal: { flexShrink: 1 },
}));
