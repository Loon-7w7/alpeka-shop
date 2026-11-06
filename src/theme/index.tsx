import { useSQLiteContext } from 'expo-sqlite';
import * as SystemUI from 'expo-system-ui';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { getSetting, setSetting } from '@/db/settings';
import {
  DEFAULT_THEME_COLOR, DEFAULT_THEME_MODE, isThemeColor, isThemeMode, PALETTES, type Colors, type ThemeColor, type ThemeMode,
} from './palettes';

export * from './palettes';

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { md: 12, lg: 16, xl: 22 } as const;

/** 48 dp es el tamaño mínimo de toque recomendado en Android. */
export const TOUCH_MIN = 48;

type ThemeState = {
  colors: Colors;
  color: ThemeColor;
  mode: ThemeMode;
  setColor: (color: ThemeColor) => void;
  setMode: (mode: ThemeMode) => void;
};

const DEFAULT_STATE: ThemeState = {
  colors: PALETTES[DEFAULT_THEME_COLOR].light,
  color: DEFAULT_THEME_COLOR,
  mode: DEFAULT_THEME_MODE,
  setColor: () => undefined,
  setMode: () => undefined,
};

// Fuera del proveedor (por ejemplo, si la base de datos no abre) se usa el tema por defecto.
const Context = createContext<ThemeState>(DEFAULT_STATE);

/** Lee el tema guardado antes de mostrar la app, para que no se vea un parpadeo de colores. */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const system = useColorScheme();
  const [prefs, setPrefs] = useState<{ color: ThemeColor; mode: ThemeMode } | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([getSetting(db, 'theme_color'), getSetting(db, 'theme_mode')])
      .then(([color, mode]) => ({
        color: isThemeColor(color) ? color : DEFAULT_THEME_COLOR,
        mode: isThemeMode(mode) ? mode : DEFAULT_THEME_MODE,
      }))
      // Si no se puede leer, la app abre con el tema por defecto.
      .catch(() => ({ color: DEFAULT_THEME_COLOR, mode: DEFAULT_THEME_MODE }))
      .then((loaded) => {
        if (current) setPrefs(loaded);
      });
    return () => {
      current = false;
    };
  }, [db]);

  const setColor = useCallback(
    (color: ThemeColor) => {
      setPrefs((now) => (now ? { ...now, color } : now));
      setSetting(db, 'theme_color', color).catch(() => undefined);
    },
    [db],
  );

  const setMode = useCallback(
    (mode: ThemeMode) => {
      setPrefs((now) => (now ? { ...now, mode } : now));
      setSetting(db, 'theme_mode', mode).catch(() => undefined);
    },
    [db],
  );

  const color = prefs?.color ?? DEFAULT_THEME_COLOR;
  const mode = prefs?.mode ?? DEFAULT_THEME_MODE;
  const scheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const colors = PALETTES[color][scheme];

  useEffect(() => {
    // Fondo detrás de la app (se ve al girar la pantalla o abrir el teclado).
    SystemUI.setBackgroundColorAsync(colors.ground).catch(() => undefined);
  }, [colors]);

  const value = useMemo(() => ({ colors, color, mode, setColor, setMode }), [colors, color, mode, setColor, setMode]);
  if (!prefs) return null;
  return <Context value={value}>{children}</Context>;
}

export const useTheme = () => use(Context);
export const useColors = () => use(Context).colors;

/** Crea un hook de estilos que se recalculan solo cuando cambia el tema. */
type Styles = Parameters<typeof StyleSheet.create>[0];

export function makeStyles<S extends Styles>(factory: (colors: Colors) => S & Styles) {
  const cache = new WeakMap<Colors, Readonly<S>>();
  return function useStyles(): Readonly<S> {
    const colors = useColors();
    let styles = cache.get(colors);
    if (!styles) {
      styles = StyleSheet.create(factory(colors));
      cache.set(colors, styles);
    }
    return styles;
  };
}
