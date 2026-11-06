import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, space, TOUCH_MIN, useColors, type Colors } from '@/theme';
import { Icon, type IconName } from './icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'highlight' | 'white' | 'outlineDark';

const paletteFor = (colors: Colors): Record<Variant, { bg: string; fg: string; border?: string }> => ({
  primary: { bg: colors.primary, fg: colors.onPrimary },
  secondary: { bg: colors.surface, fg: colors.ink, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.ink },
  danger: { bg: 'transparent', fg: colors.danger },
  highlight: { bg: colors.highlight, fg: colors.onPrimary },
  white: { bg: colors.surface, fg: colors.ink },
  // Sobre la cámara, que siempre es oscura.
  outlineDark: { bg: 'transparent', fg: '#FFFFFF', border: '#5B7870' },
});

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  large?: boolean;
  compact?: boolean;
};

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, large, compact }: Props) {
  const tone = paletteFor(useColors())[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      android_ripple={{ color: 'rgba(0,0,0,0.12)' }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        large && styles.large,
        compact && styles.compact,
        { backgroundColor: tone.bg, opacity: off ? 0.6 : pressed ? 0.85 : 1 },
        tone.border ? { borderColor: tone.border, borderWidth: 1.5 } : null,
      ]}>
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={tone.fg} /> : icon ? <Icon name={icon} color={tone.fg} /> : null}
        <Text maxFontSizeMultiplier={1.4} style={[styles.label, large && styles.labelLarge, { color: tone.fg }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    overflow: 'hidden',
  },
  large: { minHeight: 60 },
  compact: { minHeight: TOUCH_MIN, paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, flexWrap: 'wrap' },
  label: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  labelLarge: { fontSize: 18 },
});
