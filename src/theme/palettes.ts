/**
 * Colores de cada tema. Todos los temas tienen las mismas claves.
 * - `primary`: relleno pastel (botones, total). El texto encima va en `onPrimary`.
 * - `accent`: el mismo color con suficiente contraste para usarse como texto o ícono sobre `ground`/`surface`.
 * - `highlight`: etiqueta de precio, marco del escáner y detalles sobre la cámara.
 * Las pruebas revisan el contraste de cada combinación (tests/core.test.ts).
 */
export type Colors = {
  scheme: 'light' | 'dark';
  ground: string;
  surface: string;
  ink: string;
  muted: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  highlight: string;
  border: string;
  hairline: string;
  danger: string;
  dangerSoft: string;
  camera: string;
  cameraPanel: string;
  cameraMuted: string;
};

export const THEME_COLORS = ['rosa', 'rojo', 'verde', 'azul'] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];
export const THEME_MODES = ['system', 'light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const DEFAULT_THEME_COLOR: ThemeColor = 'rosa';
export const DEFAULT_THEME_MODE: ThemeMode = 'system';

export const THEME_LABELS: Record<ThemeColor, string> = { rosa: 'Rosa', rojo: 'Rojo', verde: 'Verde', azul: 'Azul' };
export const MODE_LABELS: Record<ThemeMode, string> = { system: 'Automático', light: 'Claro', dark: 'Oscuro' };

// La cámara siempre es oscura, sin importar el tema.
const camera = { camera: '#0E1F1B', cameraPanel: '#1B322C', cameraMuted: '#C8D8D3' } as const;

type Hue = {
  pastel: string;
  light: Pick<Colors, 'ground' | 'ink' | 'muted' | 'primarySoft' | 'accent' | 'border' | 'hairline'>;
  dark: Pick<Colors, 'ground' | 'surface' | 'ink' | 'muted' | 'primarySoft' | 'border' | 'hairline'>;
};

const HUES: Record<ThemeColor, Hue> = {
  rosa: {
    pastel: '#F4A7C0',
    light: { ground: '#FDF5F8', ink: '#2D1A22', muted: '#6B5260', primarySoft: '#FBE3EC', accent: '#A8325E', border: '#EBCFDA', hairline: '#F4E3EA' },
    dark: { ground: '#1A1418', surface: '#261D22', ink: '#F7EBF0', muted: '#C6B1BB', primarySoft: '#3D2833', border: '#4D3A44', hairline: '#30252B' },
  },
  rojo: {
    pastel: '#F5A3A0',
    light: { ground: '#FEF5F4', ink: '#2E1A19', muted: '#6E5452', primarySoft: '#FCE2E0', accent: '#A8352F', border: '#EDD0CD', hairline: '#F6E4E2' },
    dark: { ground: '#1A1413', surface: '#271D1C', ink: '#F7EBEA', muted: '#C8B1AF', primarySoft: '#3F2826', border: '#4F3A38', hairline: '#322625' },
  },
  verde: {
    pastel: '#9FD9B9',
    light: { ground: '#F3FAF6', ink: '#16302A', muted: '#4D6860', primarySoft: '#DCF2E5', accent: '#22704C', border: '#C5DECF', hairline: '#E2EFE7' },
    dark: { ground: '#121815', surface: '#1C2520', ink: '#E8F4EE', muted: '#A9C2B5', primarySoft: '#24392E', border: '#34483D', hairline: '#26322B' },
  },
  azul: {
    pastel: '#A7C7F2',
    light: { ground: '#F4F8FD', ink: '#172537', muted: '#4F6078', primarySoft: '#E0EBFB', accent: '#2C5A99', border: '#CBD8EA', hairline: '#E4EBF6' },
    dark: { ground: '#121620', surface: '#1C2230', ink: '#E8EEF8', muted: '#AAB7CB', primarySoft: '#26344B', border: '#36445B', hairline: '#262F40' },
  },
};

function build(color: ThemeColor, scheme: 'light' | 'dark'): Colors {
  const hue = HUES[color];
  // El texto sobre el pastel siempre es oscuro: así se lee igual en tema claro y oscuro.
  const shared = { primary: hue.pastel, highlight: hue.pastel, onPrimary: hue.light.ink, ...camera };
  if (scheme === 'light') {
    return { scheme, ...hue.light, ...shared, surface: '#FFFFFF', danger: '#B3261E', dangerSoft: '#FBE9E7' };
  }
  return { scheme, ...hue.dark, ...shared, accent: hue.pastel, danger: '#FFB4AB', dangerSoft: '#3B1F1D' };
}

/** Las 8 combinaciones se crean una sola vez: el mismo objeto sirve de llave para el caché de estilos. */
export const PALETTES = Object.fromEntries(
  THEME_COLORS.map((color) => [color, { light: build(color, 'light'), dark: build(color, 'dark') }]),
) as Record<ThemeColor, Record<'light' | 'dark', Colors>>;

export const isThemeColor = (value: unknown): value is ThemeColor => THEME_COLORS.includes(value as ThemeColor);
export const isThemeMode = (value: unknown): value is ThemeMode => THEME_MODES.includes(value as ThemeMode);

/** Contraste WCAG entre dos colores `#RRGGBB` (de 1 a 21). */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
