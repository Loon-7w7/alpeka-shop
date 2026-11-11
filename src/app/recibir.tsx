import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { Page } from '@/components/page';
import { formatCents } from '@/lib/money';
import { BackupError, type BackupData } from '@/services/backup-format';
import { pickProductsFile, previewReceive, readOpenedFile, receiveProducts } from '@/services/backup';
import { mergeChanges, noteChanges, promoChanges, type MergePlan } from '@/services/product-merge';
import { makeStyles, radius, space, useColors } from '@/theme';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'preview'; data: BackupData; plan: MergePlan }
  | { kind: 'saving'; data: BackupData; plan: MergePlan }
  | { kind: 'done'; plan: MergePlan }
  | { kind: 'error'; message: string };

const MAX_SHOWN = 5;
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n.toLocaleString('es-MX')} ${many}`);
const errorText = (error: unknown) =>
  error instanceof BackupError ? error.message : 'No se pudo leer el archivo. Inténtalo otra vez.';

/** Vuelve atrás; si se llegó directo desde otra app, abre la lista de productos. */
const leave = (to: '/productos' | '/' = '/') => (router.canGoBack() ? router.back() : router.replace(to));

/**
 * Recibe la lista de otro teléfono y la combina con la de aquí usando el código de barras.
 * Se llega al tocar el archivo en WhatsApp (o el correo) o con el botón "Recibir productos" de Ajustes.
 */
export default function ReceiveScreen() {
  const params = useLocalSearchParams<{ archivo?: string | string[] }>();
  const uri = (Array.isArray(params.archivo) ? params.archivo[0] : params.archivo) || null;
  const db = useSQLiteContext();
  const styles = useStyles();
  const [state, setState] = useState<State>(uri ? { kind: 'loading' } : { kind: 'idle' });

  // Archivo abierto desde otra app: se lee en cuanto se muestra la pantalla.
  useEffect(() => {
    if (!uri) return;
    let current = true;
    readOpenedFile(uri)
      .then(async (data) => ({ data, plan: await previewReceive(db, data) }))
      .then(
        ({ data, plan }) => {
          if (current) setState({ kind: 'preview', data, plan });
        },
        (error) => {
          if (current) setState({ kind: 'error', message: errorText(error) });
        },
      );
    return () => {
      current = false;
    };
  }, [db, uri]);

  const choose = async () => {
    setState({ kind: 'loading' });
    try {
      const picked = await pickProductsFile();
      if (!picked) {
        setState({ kind: 'idle' });
        return;
      }
      setState({ kind: 'preview', data: picked.data, plan: await previewReceive(db, picked.data) });
    } catch (error) {
      setState({ kind: 'error', message: errorText(error) });
    }
  };

  const confirm = async () => {
    if (state.kind !== 'preview') return;
    setState({ ...state, kind: 'saving' });
    try {
      setState({ kind: 'done', plan: await receiveProducts(db, state.data) });
    } catch {
      // Es todo o nada: si falló, la lista quedó como estaba.
      setState({ kind: 'error', message: 'No se pudieron guardar los productos. Tu lista no cambió; inténtalo otra vez.' });
    }
  };

  if (state.kind === 'idle') {
    return (
      <Page top={false} bottom>
        <Hero icon="download" title="Recibe la lista de otro teléfono" />
        <Steps
          items={[
            'En el otro teléfono: Productos → Compartir, y mándalo por WhatsApp, correo o Bluetooth.',
            'En este teléfono: toca el archivo que te llegó y elige "Abrir con Alpeka Shop".',
            'O guárdalo y elígelo aquí abajo.',
          ]}
        />
        <AppText variant="muted">Se agregan los productos nuevos y se actualizan los precios más recientes. No se borra nada.</AppText>
        <View style={styles.actions}>
          <Button label="Elegir archivo" icon="download" large onPress={choose} />
          <Button label="Cancelar" variant="ghost" onPress={() => leave()} />
        </View>
      </Page>
    );
  }

  if (state.kind === 'loading') {
    return (
      <Page top={false} bottom>
        <Hero icon="download" title="Leyendo el archivo…" />
      </Page>
    );
  }

  if (state.kind === 'error') {
    return (
      <Page top={false} bottom>
        <Hero icon="download" title="No se pudo recibir" />
        <AppText variant="error" accessibilityLiveRegion="polite">{state.message}</AppText>
        <View style={styles.actions}>
          <Button label="Elegir otro archivo" icon="download" onPress={choose} />
          <Button label="Cancelar" variant="ghost" onPress={() => leave()} />
        </View>
      </Page>
    );
  }

  if (state.kind === 'done') {
    const { plan } = state;
    const changed = mergeChanges(plan) > 0;
    return (
      <Page top={false} bottom>
        <Hero icon="check" title={changed ? '¡Listo!' : 'Ya tenías todo'} />
        <AppText style={styles.lead} accessibilityLiveRegion="polite">
          {changed ? doneText(plan) : 'Este archivo no traía nada nuevo. Tu lista no cambió.'}
        </AppText>
        {changed ? <AppText variant="small">Si algo no quedó bien: Ajustes → Deshacer el último cambio.</AppText> : null}
        <View style={styles.actions}>
          <Button label="Ver productos" icon="list" large onPress={() => router.replace('/productos')} />
        </View>
      </Page>
    );
  }

  // preview / saving
  const { plan, data } = state;
  const promos = promoChanges(plan);
  const notes = noteChanges(plan);
  const saving = state.kind === 'saving';
  const changes = mergeChanges(plan);
  const unchanged = plan.same + plan.keptNewer;
  return (
    <Page top={false} bottom>
      <Hero
        icon="download"
        title={
          data.products.length || !data.notes?.length
            ? `El archivo trae ${plural(data.products.length, 'producto', 'productos')}`
            : `El archivo trae ${plural(data.notes.length, 'nota de precio', 'notas de precio')}`
        }
      />

      <View style={styles.card}>
        <Stat value={plan.add.length} label={plan.add.length === 1 ? 'producto nuevo' : 'productos nuevos'} strong />
        <Stat value={plan.update.length} label={plan.update.length === 1 ? 'precio actualizado' : 'precios actualizados'} strong />
        {promos ? <Stat value={promos} label={promos === 1 ? 'promoción nueva o actualizada' : 'promociones nuevas o actualizadas'} strong /> : null}
        {notes ? <Stat value={notes} label={notes === 1 ? 'nota de precio nueva o actualizada' : 'notas de precio nuevas o actualizadas'} strong /> : null}
        <Stat value={unchanged} label="ya los tienes igual o más recientes" />
      </View>

      {plan.update.length ? (
        <View style={styles.section}>
          <AppText variant="heading">Cambios de precio</AppText>
          <View style={styles.card}>
            {plan.update.slice(0, MAX_SHOWN).map(({ before, after }) => (
              <View key={after.code} style={styles.change}>
                <AppText variant="strong" numberOfLines={1} style={styles.changeName}>{after.name}</AppText>
                <AppText variant="muted" style={styles.changePrice}>
                  {before.priceCents === after.priceCents
                    ? formatCents(after.priceCents)
                    : `${formatCents(before.priceCents)} → ${formatCents(after.priceCents)}`}
                </AppText>
              </View>
            ))}
            {plan.update.length > MAX_SHOWN ? (
              <AppText variant="small">y {plural(plan.update.length - MAX_SHOWN, 'cambio más', 'cambios más')}</AppText>
            ) : null}
          </View>
        </View>
      ) : null}

      {changes === 0 ? (
        <AppText style={styles.lead}>Ya tienes todos estos productos con el precio más reciente. No hay nada que agregar.</AppText>
      ) : (
        <AppText variant="small">No se borra nada de este teléfono. Si dos teléfonos cambiaron el mismo producto, se queda el cambio más reciente.</AppText>
      )}

      <View style={styles.actions}>
        {changes > 0 ? (
          <Button label="Agregar a mis productos" icon="check" large loading={saving} disabled={saving} onPress={confirm} />
        ) : (
          <Button label="Listo" large onPress={() => leave('/productos')} />
        )}
        <Button label="Cancelar" variant="ghost" disabled={saving} onPress={() => leave()} />
      </View>
    </Page>
  );
}

function doneText(plan: MergePlan) {
  const parts: string[] = [];
  if (plan.add.length) parts.push(`se agregaron ${plural(plan.add.length, 'producto', 'productos')}`);
  if (plan.update.length) parts.push(`se actualizaron ${plural(plan.update.length, 'precio', 'precios')}`);
  const promos = promoChanges(plan);
  if (promos) parts.push(`llegaron ${plural(promos, 'promoción', 'promociones')}`);
  const notes = noteChanges(plan);
  if (notes) parts.push(`llegaron ${plural(notes, 'nota de precio', 'notas de precio')}`);
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts.join('');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function Hero({ icon, title }: { icon: IconName; title: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.hero}>
      <View style={styles.heroIcon}>
        <Icon name={icon} size={28} color={colors.onPrimary} />
      </View>
      <AppText variant="title" accessibilityRole="header" style={styles.heroTitle}>{title}</AppText>
    </View>
  );
}

function Steps({ items }: { items: string[] }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      {items.map((text, index) => (
        <View key={text} style={styles.step}>
          <View style={styles.stepNumber}>
            <AppText variant="strong" style={styles.stepNumberText}>{index + 1}</AppText>
          </View>
          <AppText style={styles.stepText}>{text}</AppText>
        </View>
      ))}
    </View>
  );
}

function Stat({ value, label, strong }: { value: number; label: string; strong?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <AppText style={[styles.statValue, !strong && styles.statValueMuted]}>{value.toLocaleString('es-MX')}</AppText>
      <AppText variant={strong ? 'strong' : 'muted'} style={styles.statLabel}>{label}</AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  hero: { gap: space.md, alignItems: 'flex-start' },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  heroTitle: { fontSize: 24, lineHeight: 30 },
  lead: { fontSize: 17, lineHeight: 24 },
  card: { gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  section: { gap: space.sm },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  stepNumberText: { color: colors.ink },
  stepText: { flex: 1, minWidth: 0 },
  stat: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  statValue: { minWidth: 56, fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.accent, fontVariant: ['tabular-nums'] },
  statValueMuted: { color: colors.muted },
  statLabel: { flex: 1, minWidth: 0 },
  change: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  changeName: { flex: 1, minWidth: 0 },
  changePrice: { fontVariant: ['tabular-nums'] },
  actions: { marginTop: 'auto', gap: space.sm },
}));
