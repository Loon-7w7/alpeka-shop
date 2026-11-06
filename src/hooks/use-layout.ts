import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_CONTENT = 560;

/** Medidas de la ventana real: sirve para teléfonos chicos, grandes, plegables, tabletas y pantalla horizontal. */
export function useLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gutter = width < 360 ? 16 : 20;
  const usable = width - insets.left - insets.right;
  return {
    width,
    height,
    fontScale,
    insets,
    gutter,
    landscape: width > height,
    compact: height < 640 || width < 340,
    contentWidth: Math.min(usable - gutter * 2, MAX_CONTENT),
  };
}
