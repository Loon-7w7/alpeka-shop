import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { PriceEntry } from '@/components/price-entry';
import { ScanFrame } from '@/components/scan-frame';
import { findProduct } from '@/db/products';
import { activePromoRule } from '@/db/promotions';
import { useCart } from '@/hooks/use-cart';
import { useLayout } from '@/hooks/use-layout';
import { useScanBeep } from '@/hooks/use-scan-beep';
import { barcodeCandidates } from '@/lib/barcode';
import { cartCount, cartTotal } from '@/lib/cart';
import { formatCents } from '@/lib/money';
import { describePromo, type PromoRule } from '@/lib/promo';
import { notify } from '@/lib/notify';
import { makeStyles, useColors, radius, space, TOUCH_MIN } from '@/theme';

const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'];
const SCANNER_SETTINGS = { barcodeTypes: BARCODE_TYPES };
// Más corto que en Escanear: aquí es normal pasar dos veces el mismo producto para cobrar dos.
const SAME_CODE_PAUSE_MS = 1500;

type Last = { name: string; priceCents: number; promo?: PromoRule | null } | null;

/** Escaneo continuo: cada código leído se suma a la cuenta sin salir de la cámara. */
export default function CartScanScreen() {
  const colors = useColors();
  const styles = useStyles();
  const db = useSQLiteContext();
  const { items, add } = useCart();
  const { width, insets, gutter } = useLayout();
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [torch, setTorch] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [last, setLast] = useState<Last>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const beep = useScanBeep();

  const busy = useRef(false);
  const lastScan = useRef({ code: '', at: 0 });

  useFocusEffect(
    useCallback(() => {
      busy.current = false;
      setFocused(true);
      setCameraError(false);
      return () => {
        setFocused(false);
        setTorch(false);
      };
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      setForeground(next === 'active');
      if (next !== 'active') return;
      setCameraError(false);
      refreshPermission().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  const addCode = useCallback(
    async (codes: string[]) => {
      try {
        const product = await findProduct(db, codes);
        if (product) {
          // Si la promoción no se puede leer, se cobra a precio normal en lugar de detener la venta.
          const promo = await activePromoRule(db, product.code).catch(() => null);
          add({ code: product.code, name: product.name, priceCents: product.priceCents, promo });
          setLast({ name: product.name, priceCents: product.priceCents, promo });
          busy.current = false;
        } else {
          // Se queda en pausa hasta que el cajero escriba el precio o cancele.
          setUnknown(codes[0]);
        }
      } catch {
        busy.current = false;
        lastScan.current = { code: '', at: 0 };
        notify('No se pudo buscar el precio. Inténtalo otra vez.');
      }
    },
    [db, add],
  );

  const onScanned = useCallback(
    ({ data, type }: BarcodeScanningResult) => {
      if (busy.current) return;
      const codes = barcodeCandidates(data, type);
      const code = codes[0];
      const now = Date.now();
      if (!code) return;
      if (code === lastScan.current.code && now - lastScan.current.at < SAME_CODE_PAUSE_MS) return;
      busy.current = true;
      lastScan.current = { code, at: now };
      Vibration.vibrate(40);
      beep();
      addCode(codes);
    },
    [addCode, beep],
  );

  const closeUnknown = () => {
    setUnknown(null);
    busy.current = false;
  };

  const cameraOn = !!permission?.granted && focused && foreground && unknown === null && !cameraError;
  const frameWidth = Math.min(area.width || width - gutter * 2, 440);
  const frameHeight = Math.max(72, Math.min(frameWidth * 0.5, area.height ? area.height - 8 : frameWidth * 0.5));
  const padding = {
    paddingTop: insets.top + space.md,
    paddingLeft: insets.left + gutter,
    paddingRight: insets.right + gutter,
    paddingBottom: insets.bottom + space.md,
  };

  return (
    <View style={styles.root}>
      {focused ? <StatusBar style="light" /> : null}
      {permission?.granted && !cameraError ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          active={cameraOn}
          enableTorch={torch && cameraOn}
          facing="back"
          mute
          barcodeScannerSettings={SCANNER_SETTINGS}
          onBarcodeScanned={cameraOn ? onScanned : undefined}
          onMountError={() => setCameraError(true)}
        />
      ) : null}
      <View style={[styles.scrim, padding]}>
        <View style={styles.header}>
          <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.title}>Sumar a la cuenta</Text>
          {permission?.granted && !cameraError ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Linterna"
              accessibilityState={{ checked: torch }}
              hitSlop={8}
              onPress={() => setTorch((on) => !on)}
              style={[styles.torch, torch && styles.torchOn]}>
              <Icon name="flash" color={torch ? colors.onPrimary : '#FFFFFF'} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.center} onLayout={(event) => setArea(event.nativeEvent.layout)}>
          {permission?.granted && !cameraError ? (
            <ScanFrame width={frameWidth} height={frameHeight} active={cameraOn} />
          ) : permission ? (
            <View style={styles.message}>
              <Text maxFontSizeMultiplier={1.3} style={styles.hint}>
                {cameraError ? 'No se pudo abrir la cámara' : 'Falta permiso para usar la cámara'}
              </Text>
              {cameraError ? (
                <Button label="Reintentar cámara" icon="refresh" variant="highlight" onPress={() => setCameraError(false)} />
              ) : permission.canAskAgain ? (
                <Button label="Permitir cámara" variant="highlight" onPress={requestPermission} />
              ) : (
                <Button label="Abrir ajustes del teléfono" variant="highlight" onPress={Linking.openSettings} />
              )}
            </View>
          ) : null}
        </View>

        <View style={styles.panel}>
          <View accessibilityLiveRegion="polite">
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.lastText}>
              {last
                ? `+ ${last.name}  ${formatCents(last.priceCents)}${last.promo ? `  ·  ${describePromo(last.promo)}` : ''}`
                : 'Pasa los productos uno por uno'}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text maxFontSizeMultiplier={1.3} style={styles.totalLabel}>
              Total ({cartCount(items)})
            </Text>
            <Text maxFontSizeMultiplier={1.3} adjustsFontSizeToFit numberOfLines={1} style={styles.totalValue}>
              {formatCents(cartTotal(items))}
            </Text>
          </View>
          <Button label="Listo, ver la cuenta" icon="check" variant="highlight" onPress={() => router.back()} />
        </View>
      </View>

      <PriceEntry
        visible={unknown !== null}
        title="Producto no registrado"
        subtitle={unknown ? `Código ${unknown}. Escribe su precio para sumarlo.` : undefined}
        onClose={closeUnknown}
        onSubmit={({ name, priceCents }) => {
          const code = unknown;
          closeUnknown();
          if (!code) return;
          add({ code, name: name || `Sin registrar (${code})`, priceCents });
          setLast({ name: name || 'Sin registrar', priceCents });
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.camera },
  scrim: { flex: 1, minHeight: 0, overflow: 'hidden', gap: space.md, backgroundColor: 'rgba(8,20,17,0.42)' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  title: { flex: 1, color: '#FFFFFF', fontSize: 24, lineHeight: 30, fontWeight: '700' },
  torch: {
    width: TOUCH_MIN,
    height: TOUCH_MIN,
    borderRadius: TOUCH_MIN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(42,68,61,0.9)',
  },
  torchOn: { backgroundColor: colors.highlight },
  center: { flex: 1, minHeight: 0, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  message: { gap: space.md, maxWidth: 420, alignSelf: 'stretch' },
  hint: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  panel: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.cameraPanel,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
  },
  lastText: { color: colors.cameraMuted, fontSize: 15, fontWeight: '600' },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  totalLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  totalValue: { flexShrink: 1, color: colors.highlight, fontSize: 34, lineHeight: 42, fontWeight: '800', fontVariant: ['tabular-nums'] },
}));
