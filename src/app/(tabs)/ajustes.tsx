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
import { exportBackup, pickBackup, restoreBackup } from '@/services/backup';
import { checkForUpdate, currentVersion, downloadAndInstall, updatesSupported } from '@/services/updates';
import { colors, radius, space } from '@/theme';

const errorText = (error: unknown) =>
  error instanceof BackupError ? error.message : 'Algo salió mal. Inténtalo otra vez.';

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
  let detail = 'Revisa si hay una versión nueva.';
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
  const [working, setWorking] = useState<'export' | 'restore' | null>(null);

  const load = useCallback(async () => {
    const [total, backup] = await Promise.all([countProducts(db), getSetting(db, 'last_backup_at')]);
    setCount(total);
    setLastBackup(backup);
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
      notify('Respaldo listo');
      await load();
    } catch (error) {
      Alert.alert('No se pudo crear el respaldo', errorText(error));
    } finally {
      setWorking(null);
    }
  };

  const onRestore = async () => {
    setWorking('restore');
    try {
      const backup = await pickBackup();
      if (!backup) return;
      Alert.alert(
        '¿Recuperar este respaldo?',
        `Se reemplazará la lista actual por ${backup.count} ${backup.count === 1 ? 'producto' : 'productos'} del archivo.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Recuperar',
            style: 'destructive',
            onPress: async () => {
              try {
                await restoreBackup(db, backup.text);
                notify('Respaldo recuperado');
                await load();
              } catch (error) {
                Alert.alert('No se pudo recuperar', errorText(error));
              }
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('No se pudo recuperar', errorText(error));
    } finally {
      setWorking(null);
    }
  };

  return (
    <Page>
      <AppText variant="title" accessibilityRole="header">Ajustes</AppText>

      <View style={styles.note}>
        <Icon name="phone" size={24} color={colors.primary} />
        <View style={styles.noteText}>
          <AppText variant="strong">
            {count === null ? 'Productos en este teléfono' : `${count === 1 ? '1 producto' : `${count.toLocaleString('es-MX')} productos`} en este teléfono`}
          </AppText>
          <AppText>Funciona sin internet. Los precios no salen de aquí.</AppText>
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">Respaldo</AppText>
        <View style={styles.card}>
          <View style={styles.cardText}>
            <AppText variant="muted">Último respaldo</AppText>
            <AppText variant="strong">{lastBackup ? shortDate(lastBackup) : 'Todavía no hay ninguno'}</AppText>
          </View>
          <Button label="Guardar respaldo" icon="download" loading={working === 'export'} disabled={!!working} onPress={onExport} />
          <Button label="Recuperar un respaldo" variant="secondary" icon="upload" loading={working === 'restore'} disabled={!!working} onPress={onRestore} />
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
