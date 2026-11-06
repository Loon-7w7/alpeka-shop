import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Component, useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { migrate } from '@/db/migrations';
import { CartProvider } from '@/hooks/use-cart';
import { checkForUpdate } from '@/services/updates';
import { colors, space } from '@/theme';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.ground, card: colors.ground, text: colors.ink, primary: colors.primary, border: colors.hairline },
};

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

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <DatabaseBoundary>
        <SQLiteProvider databaseName="alpeka.db" onInit={migrate}>
          <Ready />
          <StatusBar style="dark" />
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
            </Stack>
          </CartProvider>
        </SQLiteProvider>
      </DatabaseBoundary>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  failed: { flex: 1, justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: colors.ground },
});
