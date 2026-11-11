import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { noteKey, unitLabel, type PriceNote } from '@/db/notes';
import { formatCents } from '@/lib/money';
import { makeStyles, useColors, space } from '@/theme';
import { AppText } from './app-text';

type Props = { note: PriceNote; onOpen?: (key: string) => void };

/** Una nota de precio. Sin `onOpen` es solo para mirar (por ejemplo, dentro de "Precio suelto"). */
export const NoteRow = memo(function NoteRow({ note, onOpen }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const price = formatCents(note.priceCents);
  const unit = unitLabel(note.unit);
  const content = (
    <>
      <View style={styles.text}>
        <AppText variant="strong" numberOfLines={2}>{note.name}</AppText>
        <AppText variant="small" numberOfLines={1}>Sin código · {unit}</AppText>
      </View>
      <Text maxFontSizeMultiplier={1.4} style={styles.price}>{price}</Text>
    </>
  );
  if (!onOpen) {
    return (
      <View accessible accessibilityLabel={`${note.name}, ${price} ${unit}`} style={styles.row}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${note.name}, ${price} ${unit}`}
      android_ripple={{ color: colors.primarySoft }}
      onPress={() => onOpen(noteKey(note.name))}
      style={styles.row}>
      {content}
    </Pressable>
  );
});

const useStyles = makeStyles((colors) => ({
  row: {
    minHeight: 64,
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
