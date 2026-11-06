import type { ComponentRef, Ref } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { makeStyles, useColors, radius, space } from '@/theme';
import { AppText } from './app-text';

type Props = TextInputProps & { label: string; error?: string; prefix?: string; large?: boolean; ref?: Ref<ComponentRef<typeof TextInput>> };

export function Field({ label, error, prefix, large, style, ...input }: Props) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <AppText variant="strong">{label}</AppText>
      <View style={[styles.box, !!error && styles.boxError]}>
        {prefix ? <AppText style={[styles.prefix, large && styles.large]}>{prefix}</AppText> : null}
        <TextInput
          accessibilityLabel={label}
          maxFontSizeMultiplier={1.5}
          placeholderTextColor={colors.muted}
          style={[styles.input, large && styles.large, style]}
          {...input}
        />
      </View>
      {error ? <AppText variant="error" accessibilityLiveRegion="polite">{error}</AppText> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: space.xs + 2 },
  box: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md + 2,
  },
  boxError: { borderColor: colors.danger },
  input: { flex: 1, minWidth: 0, fontSize: 17, color: colors.ink, paddingVertical: space.sm },
  prefix: { marginRight: space.xs, fontWeight: '700', color: colors.muted },
  large: { fontSize: 24, fontWeight: '700' },
}));
