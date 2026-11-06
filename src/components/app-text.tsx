import { memo } from 'react';
import { Text, type TextProps } from 'react-native';

import { makeStyles } from '@/theme';

const useVariants = makeStyles((colors) => ({
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.ink },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.ink },
  body: { fontSize: 16, lineHeight: 22, color: colors.ink },
  strong: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.ink },
  muted: { fontSize: 15, lineHeight: 21, color: colors.muted },
  small: { fontSize: 13, lineHeight: 18, color: colors.muted },
  error: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.danger },
}));

type Props = TextProps & { variant?: keyof ReturnType<typeof useVariants> };

export const AppText = memo(function AppText({ variant = 'body', style, ...props }: Props) {
  const variants = useVariants();
  return <Text maxFontSizeMultiplier={1.6} style={[variants[variant], style]} {...props} />;
});
