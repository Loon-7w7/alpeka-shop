import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Page } from '@/components/page';
import { countProducts } from '@/db/products';
import { getSetting } from '@/db/settings';
import { useUpdates } from '@/hooks/use-updates';
import { shortDate } from '@/lib/dates';
import { notify } from '@/lib/notify';
import { BackupError } from '@/services/backup-format';
import { exportBackup, lastSafetyCopy, pickBackup, restoreBackup, undoLastRestore } from '@/services/backup';
import { checkForUpdate, currentVersion, downloadAndInstall, updatesSupported } from '@/services/updates';
import { colors, radius, space } from '@/theme';

const errorText = (error: unknown) =>
  error instanceof BackupError ? error.message : 'Algo salió mal. Inténtalo otra vez.';

const products = (n: number) => (n === 1 ? '1 producto' : `${n.toLocaleString('es-MX')} productos`);

function UpdatesCard() {
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
  const db = useSQLiteContext();
  const [count, setCount] = useState<number | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [undoDate, setUndoDate] = useState<string | null>(null);
  const [working, setWorking] = useState<'export' | 'restore' | 'undo' | null>(null);

  /** Nunca lanza: si algo no se puede leer, se deja lo que ya se mostraba. */
  const load = useCallback(async () => {
    try {
      const [total, backup] = await Promise.all([countProducts(db), getSetting(db, 'last_backup_at')]);
      setCount(total);
      setLastBackup(backup);
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
      '¿Deshacer la última recuperación?',
      `La lista volverá a como estaba el ${shortDate(undoDate)}, antes de recuperar el respaldo.`,
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
        <Icon name="phone" size={24} color={colors.primary} />
        <View style={styles.noteText}>
          <AppText variant="strong">
            {count === null ? 'Productos en este teléfono' : `${products(count)} en este teléfono`}
          </AppText>
          <AppText>Funciona sin internet. Los precios no salen de aquí.</AppText>
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
          <Button label="Guardar respaldo" icon="download" loading={working === 'export'} disabled={!!working} onPress={onExport} />
          <Button label="Recuperar un respaldo" variant="secondary" icon="upload" loading={working === 'restore'} disabled={!!working} onPress={onRestore} />
          {undoDate ? (
            <Button label="Deshacer la última recuperación" variant="ghost" icon="refresh" loading={working === 'undo'} disabled={!!working} onPress={onUndo} />
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">Actualizaciones</AppText>
        <UpdatesCard />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
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
});
