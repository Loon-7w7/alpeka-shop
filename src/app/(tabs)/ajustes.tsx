import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Platform, Switch, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Page } from '@/components/page';
import { ThemePicker } from '@/components/theme-picker';
import { countProducts } from '@/db/products';
import { getSetting, scanSoundOn, setSetting } from '@/db/settings';
import { useUpdates } from '@/hooks/use-updates';
import { shortDate } from '@/lib/dates';
import { notify } from '@/lib/notify';
import { BackupError } from '@/services/backup-format';
import { exportBackup, lastSafetyCopy, pickBackup, restoreBackup, shareProducts, undoLastRestore } from '@/services/backup';
import { checkForUpdate, currentVersion, downloadAndInstall, updatesSupported } from '@/services/updates';
import { makeStyles, useColors, radius, space } from '@/theme';

const errorText = (error: unknown) =>
  error instanceof BackupError ? error.message : 'Algo salió mal. Inténtalo otra vez.';

const products = (n: number) => (n === 1 ? '1 producto' : `${n.toLocaleString('es-MX')} productos`);

function UpdatesCard() {
  const styles = useStyles();
  const state = useUpdates();
  const version = currentVersion();

  if (!updatesSupported()) {
    return (
      <View style={styles.card}>
        <AppText variant="strong">Alpeka Shop {version}</AppText>
        <AppText variant="muted">
          {Platform.OS === 'android'
            ? 'La búsqueda de actualizaciones se activa al configurar el enlace de GitHub.'
            : 'Las actualizaciones por APK solo funcionan en Android.'}
        </AppText>
      </View>
    );
  }

  let title = `Alpeka Shop ${version}`;
  let detail = 'Las mejoras pequeñas llegan solas al abrir la app. Aquí puedes buscar una versión nueva completa.';
  let action = <Button label="Buscar actualizaciones" variant="secondary" icon="refresh" onPress={() => checkForUpdate()} />;

  if (state.status === 'checking') {
    detail = 'Revisando…';
    action = <Button label="Revisando…" variant="secondary" loading onPress={() => undefined} />;
  } else if (state.status === 'upToDate') {
    detail = 'Ya tienes la versión más reciente.';
  } else if (state.status === 'available') {
    title = `Hay una versión nueva: ${state.manifest.version}`;
    detail = state.manifest.notes ?? 'Tus productos y precios se conservan.';
    action = <Button label="Instalar actualización" icon="download" onPress={() => downloadAndInstall(state.manifest)} />;
  } else if (state.status === 'downloading') {
    const percent = state.progress === null ? null : Math.round(state.progress * 100);
    title = `Descargando ${state.manifest.version}`;
    detail = percent === null ? 'Espera un momento…' : `${percent}% descargado`;
    action = <Button label="Descargando…" loading onPress={() => undefined} />;
  } else if (state.status === 'error') {
    detail = state.message;
    const failed = state.manifest;
    action = failed ? (
      <Button label="Intentar otra vez" icon="download" onPress={() => downloadAndInstall(failed)} />
    ) : (
      <Button label="Buscar actualizaciones" variant="secondary" icon="refresh" onPress={() => checkForUpdate()} />
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardText}>
        <AppText variant="strong">{title}</AppText>
        <AppText variant={state.status === 'error' ? 'error' : 'muted'} accessibilityLiveRegion="polite">{detail}</AppText>
      </View>
      {action}
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const db = useSQLiteContext();
  const [count, setCount] = useState<number | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [undoDate, setUndoDate] = useState<string | null>(null);
  const [working, setWorking] = useState<'share' | 'export' | 'restore' | 'undo' | null>(null);
  const [sound, setSound] = useState(true);

  /** Nunca lanza: si algo no se puede leer, se deja lo que ya se mostraba. */
  const load = useCallback(async () => {
    try {
      const [total, backup, beep] = await Promise.all([
        countProducts(db),
        getSetting(db, 'last_backup_at'),
        getSetting(db, 'scan_sound'),
      ]);
      setCount(total);
      setLastBackup(backup);
      setSound(scanSoundOn(beep));
    } catch {
      // La pantalla sigue funcionando; el número se actualiza al volver a entrar.
    }
    try {
      setUndoDate(lastSafetyCopy()?.date ?? null);
    } catch {
      setUndoDate(null);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onSound = async (on: boolean) => {
    setSound(on);
    try {
      await setSetting(db, 'scan_sound', on ? '1' : '0');
    } catch {
      setSound(!on);
      notify('No se pudo guardar el ajuste. Inténtalo otra vez.');
    }
  };

  const onShare = async () => {
    setWorking('share');
    try {
      await shareProducts(db);
    } catch (error) {
      Alert.alert('No se pudo compartir', errorText(error));
    } finally {
      setWorking(null);
      load();
    }
  };

  const onExport = async () => {
    setWorking('export');
    try {
      await exportBackup(db);
      notify('Respaldo compartido');
    } catch (error) {
      Alert.alert('No se pudo crear el respaldo', errorText(error));
    } finally {
      setWorking(null);
      load();
    }
  };

  const runRestore = async (text: string) => {
    try {
      await restoreBackup(db, text);
      notify('Respaldo recuperado');
    } catch (error) {
      Alert.alert('No se pudo recuperar', errorText(error));
    } finally {
      setWorking(null);
      load();
    }
  };

  const onRestore = async () => {
    setWorking('restore');
    let backup: Awaited<ReturnType<typeof pickBackup>>;
    try {
      backup = await pickBackup();
    } catch (error) {
      setWorking(null);
      Alert.alert('No se pudo recuperar', errorText(error));
      return;
    }
    if (!backup) {
      setWorking(null);
      return;
    }
    const { text, count: incoming } = backup;
    // El indicador sigue activo hasta que la persona decida en el aviso.
    Alert.alert(
      '¿Recuperar este respaldo?',
      `Se reemplazará la lista actual por ${products(incoming)} del archivo. Se guarda una copia de la lista actual por si necesitas deshacerlo.`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => setWorking(null) },
        { text: 'Recuperar', style: 'destructive', onPress: () => runRestore(text) },
      ],
      { cancelable: true, onDismiss: () => setWorking(null) },
    );
  };

  const onUndo = () => {
    if (!undoDate) return;
    Alert.alert(
      '¿Deshacer el último cambio de la lista?',
      `La lista volverá a como estaba el ${shortDate(undoDate)}, antes de recibir o recuperar productos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deshacer',
          style: 'destructive',
          onPress: async () => {
            setWorking('undo');
            try {
              await undoLastRestore(db);
              notify('Lista anterior recuperada');
            } catch (error) {
              Alert.alert('No se pudo deshacer', errorText(error));
            } finally {
              setWorking(null);
              load();
            }
          },
        },
      ],
    );
  };

  return (
    <Page>
      <AppText variant="title" accessibilityRole="header">Ajustes</AppText>

      <View style={styles.note}>
        <Icon name="phone" size={24} color={colors.accent} />
        <View style={styles.noteText}>
          <AppText variant="strong">
            {count === null ? 'Productos en este teléfono' : `${products(count)} en este teléfono`}
          </AppText>
          <AppText>Funciona sin internet. Los precios no salen de aquí.</AppText>
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">Apariencia</AppText>
        <ThemePicker />
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">Escáner</AppText>
        <View style={[styles.card, styles.switchRow]}>
          <View style={styles.switchText}>
            <AppText variant="strong">Sonido al escanear</AppText>
            <AppText variant="small">Suena un beep al leer un código. En modo silencio solo vibra.</AppText>
          </View>
          <Switch
            accessibilityLabel="Sonido al escanear"
            value={sound}
            onValueChange={onSound}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={sound ? colors.accent : colors.surface}
            ios_backgroundColor={colors.border}
          />
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">Compartir con otro teléfono</AppText>
        <View style={styles.card}>
          <AppText variant="small">
            Manda tu lista por WhatsApp, correo o Bluetooth. En el otro teléfono se agregan los productos nuevos y se actualizan los
            precios más recientes; no se borra nada.
          </AppText>
          <Button label="Compartir productos" icon="share" loading={working === 'share'} disabled={!!working} onPress={onShare} />
          <Button label="Recibir productos" variant="secondary" icon="download" disabled={!!working} onPress={() => router.push('/recibir')} />
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">Respaldo</AppText>
        <View style={styles.card}>
          <View style={styles.cardText}>
            <AppText variant="muted">Último respaldo compartido</AppText>
            <AppText variant="strong">{lastBackup ? shortDate(lastBackup) : 'Todavía no hay ninguno'}</AppText>
            <AppText variant="small">Guarda el archivo en Drive, en tu correo o en otro teléfono para no perder tus precios.</AppText>
          </View>
          <Button label="Guardar respaldo" variant="secondary" icon="download" loading={working === 'export'} disabled={!!working} onPress={onExport} />
          <Button label="Recuperar un respaldo" variant="secondary" icon="upload" loading={working === 'restore'} disabled={!!working} onPress={onRestore} />
          {undoDate ? (
            <Button label="Deshacer el último cambio" variant="ghost" icon="refresh" loading={working === 'undo'} disabled={!!working} onPress={onUndo} />
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">Actualizaciones</AppText>
        <UpdatesCard />
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">Créditos</AppText>
        <View style={[styles.card, styles.cardText]}>
          <AppText variant="muted">Desarrollado por</AppText>
          <AppText variant="strong">Producciones Alpeka/LonyArts</AppText>
        </View>
      </View>
    </Page>
  );
}

const useStyles = makeStyles((colors) => ({
  note: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  noteText: { flex: 1, minWidth: 0, gap: 2 },
  section: { gap: space.sm + 2 },
  card: { gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  cardText: { gap: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  switchText: { flex: 1, minWidth: 0, gap: 2 },
}));
