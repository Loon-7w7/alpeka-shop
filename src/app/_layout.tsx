import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Component, useEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { migrate } from '@/db/migrations';
import { CartProvider } from '@/hooks/use-cart';
import { checkForUpdate } from '@/services/updates';
import { AppThemeProvider, DEFAULT_THEME_COLOR, PALETTES, space, useColors } from '@/theme';

SplashScreen.preventAutoHideAsync();

function Ready() {
  useEffect(() => {
    SplashScreen.hideAsync();
    checkForUpdate({ silent: true });
  }, []);
  return null;
}

/** Si la base de datos no abre, muestra un mensaje claro en lugar de cerrar la app. */
class DatabaseBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.failed}>
        <Ready />
        <AppText variant="heading">No se pudieron abrir los precios</AppText>
        <AppText>Cierra la app y vuelve a abrirla. Tus datos no se han borrado.</AppText>
      </View>
    );
  }
}

/** Navegación con los colores del tema elegido. */
function ThemedApp() {
  const colors = useColors();
  const navTheme = useMemo(() => {
    const base = colors.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, background: colors.ground, card: colors.ground, text: colors.ink, primary: colors.accent, border: colors.hairline },
    };
  }, [colors]);

  return (
    <ThemeProvider value={navTheme}>
      <Ready />
      <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />
      <CartProvider>
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.ground },
            headerTintColor: colors.ink,
            contentStyle: { backgroundColor: colors.ground },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="bienvenida" options={{ headerShown: false }} />
          <Stack.Screen name="producto/[codigo]" options={{ title: 'Producto' }} />
          <Stack.Screen name="producto/formulario" options={{ title: 'Producto nuevo' }} />
          <Stack.Screen name="cuenta/escanear" options={{ headerShown: false }} />
          <Stack.Screen name="cuenta/buscar" options={{ title: 'Sumar producto' }} />
          <Stack.Screen name="recibir" options={{ title: 'Recibir productos' }} />
          <Stack.Screen name="promocion/formulario" options={{ title: 'Promoción' }} />
          <Stack.Screen name="nota/formulario" options={{ title: 'Nota nueva' }} />
        </Stack>
      </CartProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <DatabaseBoundary>
      <SQLiteProvider databaseName="alpeka.db" onInit={migrate}>
        {/* El tema se lee de la base de datos; mientras tanto sigue la pantalla de carga. */}
        <AppThemeProvider>
          <ThemedApp />
        </AppThemeProvider>
      </SQLiteProvider>
    </DatabaseBoundary>
  );
}

const styles = StyleSheet.create({
  failed: { flex: 1, justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: PALETTES[DEFAULT_THEME_COLOR].light.ground },
});
