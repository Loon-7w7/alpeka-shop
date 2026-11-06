import { router } from 'expo-router';
import { useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { setSetting } from '@/db/settings';
import { useLayout } from '@/hooks/use-layout';
import { colors, space } from '@/theme';

function Point({ text }: { text: string }) {
  return (
    <View style={styles.point}>
      <View style={styles.pointIcon}>
        <Icon name="check" size={16} color={colors.primary} />
      </View>
      <AppText style={styles.pointText}>{text}</AppText>
    </View>
  );
}

export default function Welcome() {
  const db = useSQLiteContext();
  const { width, height, landscape, insets, gutter } = useLayout();
  const art = landscape ? Math.min(height * 0.72, width * 0.36) : Math.min(width * 0.82, height * 0.38, 420);

  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);

  const start = async () => {
    if (starting) return;
    setStarting(true);
    setFailed(false);
    try {
      await setSetting(db, 'welcome_seen', '1');
      router.replace('/');
    } catch {
      setFailed(true);
      setStarting(false);
    }
  };

  return (
    <View style={[styles.root, landscape && styles.rootRow]}>
      <View
        style={[
          styles.hero,
          landscape ? { flex: 1, paddingLeft: insets.left } : { paddingTop: insets.top + space.lg },
        ]}>
        <Image
          source={require('../../assets/images/alpaca.png')}
          style={{ width: art, height: art }}
          accessibilityLabel="Alpaca de Alpeka Shop con una etiqueta de precio"
        />
      </View>
      <ScrollView
        style={styles.panel}
        contentContainerStyle={[
          styles.panelContent,
          {
            paddingLeft: (landscape ? 0 : insets.left) + gutter + 4,
            paddingRight: insets.right + gutter + 4,
            paddingBottom: insets.bottom + space.xl,
            paddingTop: (landscape ? insets.top : 0) + space.xl,
          },
        ]}>
        <View style={styles.copy}>
          <AppText accessibilityRole="header" style={styles.name}>Alpeka Shop</AppText>
          <AppText style={styles.lead}>Escanea un producto y mira cuánto cobrar.</AppText>
        </View>
        <View style={styles.points}>
          <Point text="Funciona con la cámara de tu teléfono" />
          <Point text="No necesitas internet ni cuenta" />
        </View>
        <View style={styles.action}>
          {failed ? <AppText variant="error">No se pudo continuar. Cierra la app y vuelve a abrirla.</AppText> : null}
          <Button label="Empezar" large loading={starting} onPress={start} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  rootRow: { flexDirection: 'row' },
  hero: { backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'flex-end' },
  panel: { flex: 1 },
  panelContent: { flexGrow: 1, gap: space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  copy: { gap: space.xs },
  name: { fontSize: 36, lineHeight: 42, fontWeight: '800' },
  lead: { fontSize: 18, lineHeight: 25, color: colors.muted },
  points: { gap: space.md - 2 },
  point: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pointIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointText: { flex: 1, fontWeight: '500' },
  action: { marginTop: 'auto' },
});
