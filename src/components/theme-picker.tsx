import { Pressable, View } from 'react-native';

import {
  makeStyles, MODE_LABELS, PALETTES, radius, space, THEME_COLORS, THEME_LABELS, THEME_MODES, TOUCH_MIN, useTheme,
} from '@/theme';
import { AppText } from './app-text';
import { Icon } from './icon';

/** Elegir color (rosa, rojo, verde, azul) y modo (automático, claro, oscuro). El cambio se ve al instante. */
export function ThemePicker() {
  const { colors, color, mode, setColor, setMode } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.card}>
      <View style={styles.group}>
        <AppText variant="muted">Color</AppText>
        <View style={styles.swatches} accessibilityRole="radiogroup">
          {THEME_COLORS.map((option) => {
            const selected = option === color;
            const swatch = PALETTES[option][colors.scheme];
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={THEME_LABELS[option]}
                accessibilityState={{ checked: selected }}
                onPress={() => setColor(option)}
                style={styles.swatchItem}>
                <View style={[styles.swatch, { backgroundColor: swatch.primary }, selected && styles.swatchSelected]}>
                  {selected ? <Icon name="check" size={22} color={swatch.onPrimary} /> : null}
                </View>
                <AppText variant={selected ? 'strong' : 'small'}>{THEME_LABELS[option]}</AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <AppText variant="muted">Modo</AppText>
        <View style={styles.segments} accessibilityRole="radiogroup">
          {THEME_MODES.map((option) => {
            const selected = option === mode;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setMode(option)}
                style={[styles.segment, selected && styles.segmentSelected]}>
                <AppText variant="strong" style={selected ? styles.segmentTextSelected : undefined} numberOfLines={1}>
                  {MODE_LABELS[option]}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        {mode === 'system' ? <AppText variant="small">Usa el modo claro u oscuro del teléfono.</AppText> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: space.lg, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  group: { gap: space.sm },
  swatches: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  swatchItem: { flex: 1, alignItems: 'center', gap: space.xs, minHeight: TOUCH_MIN },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  swatchSelected: { borderColor: colors.ink },
  segments: {
    flexDirection: 'row',
    padding: space.xs,
    gap: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.ground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    minHeight: TOUCH_MIN - 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md - 4,
    paddingHorizontal: space.xs,
  },
  segmentSelected: { backgroundColor: colors.primary },
  segmentTextSelected: { color: colors.onPrimary },
}));
