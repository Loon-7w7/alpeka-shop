import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ManualEntry } from '@/components/manual-entry';
import { ScanFrame } from '@/components/scan-frame';
import { findProduct } from '@/db/products';
import { useLayout } from '@/hooks/use-layout';
import { useScanBeep } from '@/hooks/use-scan-beep';
import { useUpdates } from '@/hooks/use-updates';
import { barcodeCandidates } from '@/lib/barcode';
import { notify } from '@/lib/notify';
import { makeStyles, useColors, radius, space, TOUCH_MIN } from '@/theme';

const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'];
const SCANNER_SETTINGS = { barcodeTypes: BARCODE_TYPES };
const SAME_CODE_PAUSE_MS = 2500;

export default function ScanScreen() {
  const colors = useColors();
  const styles = useStyles();
  const db = useSQLiteContext();
  const { width, landscape, insets, gutter } = useLayout();
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [torch, setTorch] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const updates = useUpdates();
  const beep = useScanBeep();

  const busy = useRef(false);
  const lastScan = useRef({ code: '', at: 0 });

  useFocusEffect(
    useCallback(() => {
      busy.current = false;
      setFocused(true);
      // La cámara pudo liberarse mientras la pestaña no se veía: se vuelve a intentar.
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
      // Al volver de los ajustes del teléfono (o de otra app que usaba la cámara) se revisa de nuevo.
      setCameraError(false);
      refreshPermission().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  const openCode = useCallback(
    async (codes: string[]) => {
      try {
        const product = await findProduct(db, codes);
        if (product) router.push({ pathname: '/producto/[codigo]', params: { codigo: product.code } });
        else router.push({ pathname: '/producto/formulario', params: { codigo: codes[0], desdeEscaneo: '1' } });
      } catch {
        busy.current = false;
        // Permite volver a leer el mismo código enseguida.
        lastScan.current = { code: '', at: 0 };
        notify('No se pudo buscar el precio. Inténtalo otra vez.');
      }
    },
    [db],
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
      openCode(codes);
    },
    [openCode, beep],
  );

  const submitManual = (code: string) => {
    setManualOpen(false);
    busy.current = true;
    openCode(barcodeCandidates(code));
  };

  const cameraOn = !!permission?.granted && focused && foreground && !manualOpen && !cameraError;
  // El recuadro se ajusta al espacio medido: así cabe en pantallas chicas, horizontal, tabletas y plegables.
  const frameWidth = Math.min(area.width || width - gutter * 2, 440);
  const showHints = area.height === 0 || area.height >= 150;
  const frameHeight = Math.max(72, Math.min(frameWidth * 0.6, area.height ? area.height - (showHints ? 76 : 8) : frameWidth * 0.6));
  const padding = {
    paddingTop: insets.top + space.md,
    paddingLeft: insets.left + gutter,
    paddingRight: insets.right + gutter,
    paddingBottom: space.md,
  };

  const update = updates.status === 'available' ? updates.manifest.version : null;

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
          <View style={styles.headerText}>
            <Text maxFontSizeMultiplier={1.3} style={styles.brand}>Alpeka Shop</Text>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.title}>Escanear</Text>
          </View>
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

        {update ? (
          <Pressable accessibilityRole="button" onPress={() => router.navigate('/ajustes')} style={styles.updateBanner}>
            <Icon name="refresh" size={18} color={colors.onPrimary} />
            <Text maxFontSizeMultiplier={1.3} style={styles.updateText}>Hay una versión nueva: {update}. Toca para ver.</Text>
          </Pressable>
        ) : null}

        <View style={[styles.body, landscape && styles.bodyRow]}>
          <View style={styles.center} onLayout={(event) => setArea(event.nativeEvent.layout)}>
            {permission?.granted && !cameraError ? (
              <>
                <ScanFrame width={frameWidth} height={frameHeight} active={cameraOn} />
                {showHints ? (
                  <>
                    <Text maxFontSizeMultiplier={1.2} numberOfLines={2} style={styles.hint}>Coloca el código dentro del recuadro</Text>
                    <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.subHint}>Se lee solo. No hace falta tomar foto.</Text>
                  </>
                ) : null}
              </>
            ) : permission ? (
              <View style={styles.message}>
                <Text maxFontSizeMultiplier={1.3} style={styles.hint}>
                  {cameraError ? 'No se pudo abrir la cámara' : 'Falta permiso para usar la cámara'}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={styles.subHint}>
                  {cameraError
                    ? 'Cierra otras apps que la estén usando o escribe el número del producto.'
                    : 'Se usa solo para leer códigos de barras. No se guardan fotos.'}
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
          <View style={landscape ? styles.sideAction : undefined}>
            <Button label="Escribir el número" icon="keypad" variant="outlineDark" onPress={() => setManualOpen(true)} />
          </View>
        </View>
      </View>
      <ManualEntry visible={manualOpen} onClose={() => setManualOpen(false)} onSubmit={submitManual} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.camera },
  scrim: { flex: 1, minHeight: 0, overflow: 'hidden', gap: space.md, backgroundColor: 'rgba(8,20,17,0.42)' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  headerText: { flex: 1, minWidth: 0 },
  brand: { color: colors.highlight, fontSize: 14, fontWeight: '700' },
  title: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontWeight: '700' },
  torch: {
    width: TOUCH_MIN,
    height: TOUCH_MIN,
    borderRadius: TOUCH_MIN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(42,68,61,0.9)',
  },
  torchOn: { backgroundColor: colors.highlight },
  updateBanner: {
    minHeight: TOUCH_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.highlight,
  },
  updateText: { flex: 1, color: colors.onPrimary, fontSize: 14, fontWeight: '600' },
  body: { flex: 1, minHeight: 0, gap: space.md },
  bodyRow: { flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, minWidth: 0, minHeight: 0, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  hint: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  subHint: { color: colors.cameraMuted, fontSize: 14, textAlign: 'center' },
  message: { gap: space.md, maxWidth: 420, alignSelf: 'stretch' },
  sideAction: { width: 200 },
}));
