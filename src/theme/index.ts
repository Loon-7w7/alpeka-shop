export const colors = {
  ground: '#F4F7F5',
  surface: '#FFFFFF',
  ink: '#12302B',
  muted: '#4F6A63',
  primary: '#0B6E5F',
  primarySoft: '#DDEFEA',
  onPrimary: '#FFFFFF',
  amber: '#FFC83D',
  pink: '#F59FBF',
  border: '#C2D3CD',
  hairline: '#E3EBE8',
  danger: '#B3261E',
  dangerSoft: '#FBE9E7',
  camera: '#0E1F1B',
  cameraPanel: '#1B322C',
  cameraMuted: '#C8D8D3',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { md: 12, lg: 16, xl: 22 } as const;

/** 48 dp es el tamaño mínimo de toque recomendado en Android. */
export const TOUCH_MIN = 48;
