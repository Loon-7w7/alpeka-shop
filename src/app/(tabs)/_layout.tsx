import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { ICONS } from '@/components/icon';
import { getSetting } from '@/db/settings';
import { useColors } from '@/theme';

export default function TabsLayout() {
  const colors = useColors();
  const db = useSQLiteContext();
  const [welcomed, setWelcomed] = useState<boolean | null>(null);

  useEffect(() => {
    getSetting(db, 'welcome_seen')
      .then((value) => setWelcomed(value !== null))
      // Si no se puede leer, mejor saltar la bienvenida que dejar la app en blanco.
      .catch(() => setWelcomed(true));
  }, [db]);

  if (welcomed === null) return null;
  if (!welcomed) return <Redirect href="/bienvenida" />;

  return (
    <NativeTabs
      backgroundColor={colors.surface}
      indicatorColor={colors.primarySoft}
      tintColor={colors.accent}
      iconColor={{ default: colors.muted, selected: colors.accent }}
      labelStyle={{ default: { color: colors.muted }, selected: { color: colors.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Escanear</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.scan} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cuenta">
        <NativeTabs.Trigger.Label>Cuenta</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.cart} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="productos">
        <NativeTabs.Trigger.Label>Productos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.list} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="promos">
        <NativeTabs.Trigger.Label>Promos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.tag} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="ajustes">
        <NativeTabs.Trigger.Label>Ajustes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.settings} renderingMode="template" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
