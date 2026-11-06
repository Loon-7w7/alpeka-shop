import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useLayout } from '@/hooks/use-layout';
import { makeStyles, space } from '@/theme';

/** Contenedor con desplazamiento: si no cabe (pantalla chica, letra grande, horizontal), se puede recorrer. */
export function Page({ children, top = true, bottom = false }: { children: ReactNode; top?: boolean; bottom?: boolean }) {
  const styles = useStyles();
  const { insets, gutter, contentWidth } = useLayout();
  return (
    <ScrollView
      style={styles.root}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: (top ? insets.top : 0) + space.lg,
          paddingBottom: (bottom ? insets.bottom : 0) + space.xl,
          paddingLeft: insets.left + gutter,
          paddingRight: insets.right + gutter,
        },
      ]}>
      <View style={[styles.inner, { width: contentWidth }]}>{children}</View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.ground },
  content: { flexGrow: 1, alignItems: 'center' },
  inner: { flexGrow: 1, gap: space.lg },
}));
