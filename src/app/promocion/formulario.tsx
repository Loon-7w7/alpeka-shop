import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, Switch, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Icon } from '@/components/icon';
import { Page } from '@/components/page';
import { ProductRow } from '@/components/product-row';
import { getProduct, searchProducts, type Product } from '@/db/products';
import { deletePromotion, getPromotion, MissingPromoProductError, savePromotion, type Promotion } from '@/db/promotions';
import { centsToInput, formatCents } from '@/lib/money';
import { notify } from '@/lib/notify';
import {
  buildPromoRule, describePromo, exampleQty, priceLine, PROMO_KIND_NAMES, PROMO_KINDS,
  type PromoField, type PromoInput, type PromoKind, type PromoRule,
} from '@/lib/promo';
import { makeStyles, useColors, radius, space } from '@/theme';

const PICKER_LIMIT = 30;
const EMPTY_INPUT: PromoInput = { qty: '', price: '', take: '', pay: '', percent: '' };

const KIND_HELP: Record<PromoKind, string> = {
  bundle: 'Ej. 3 por $25. Las piezas que sobran se cobran a precio normal.',
  nxm: 'Ej. 2x1 o 3x2: de cada grupo, el cliente paga menos piezas.',
  percent: 'Ej. 10 % menos en cada pieza. Se redondea al centavo.',
  sale: 'El producto se cobra a este precio mientras la promoción esté encendida.',
};

function inputFromRule(rule: PromoRule): PromoInput {
  switch (rule.kind) {
    case 'bundle':
      return { ...EMPTY_INPUT, qty: String(rule.qty), price: centsToInput(rule.priceCents) };
    case 'nxm':
      return { ...EMPTY_INPUT, take: String(rule.take), pay: String(rule.pay) };
    case 'percent':
      return { ...EMPTY_INPUT, percent: String(rule.percent) };
    case 'sale':
      return { ...EMPTY_INPUT, price: centsToInput(rule.priceCents) };
  }
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const pieces = (n: number) => (n === 1 ? '1 pieza' : `${n} piezas`);

/**
 * Crear o cambiar la promoción de un producto (una por producto).
 * Sin `codigo`, primero se elige el producto; si ese producto ya tiene promoción, se abre para cambiarla.
 */
export default function PromoForm() {
  const styles = useStyles();
  const colors = useColors();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ codigo?: string | string[] }>();
  const initialCode = first(params.codigo) ?? null;
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(initialCode !== null);
  const [exists, setExists] = useState(false);
  const [kind, setKind] = useState<PromoKind>('bundle');
  const [input, setInput] = useState<PromoInput>(EMPTY_INPUT);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<{ field?: PromoField; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  // Selector de producto (solo para una promoción nueva).
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[] | null>(null);

  /** Muestra el producto elegido y, si ya tenía promoción, la carga para cambiarla. */
  const apply = (found: Product | null, promo: Promotion | null) => {
    setLoading(false);
    if (!found) {
      notify('Este producto ya no está guardado');
      if (initialCode) router.back();
      return;
    }
    setProduct(found);
    setExists(promo !== null);
    if (promo) {
      setKind(promo.rule.kind);
      setInput(inputFromRule(promo.rule));
      setActive(promo.active);
    }
  };

  const failed = () => {
    setLoading(false);
    notify('No se pudo abrir el producto. Inténtalo otra vez.');
    if (initialCode) router.back();
  };

  const load = (code: string) => Promise.all([getProduct(db, code), getPromotion(db, code)]);

  const choose = (code: string) => {
    setLoading(true);
    load(code).then(([found, promo]) => apply(found, promo), failed);
  };

  useEffect(() => {
    if (!initialCode) return;
    let current = true;
    load(initialCode).then(
      ([found, promo]) => {
        if (current) apply(found, promo);
      },
      () => {
        if (current) failed();
      },
    );
    return () => {
      current = false;
    };
    // Solo al abrir la pantalla con un código.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  useEffect(() => {
    if (product || initialCode) return;
    let current = true;
    const timer = setTimeout(() => {
      searchProducts(db, query).then(
        (found) => {
          if (current) setResults(found.slice(0, PICKER_LIMIT));
        },
        () => {
          if (current) setResults([]);
        },
      );
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [db, query, product, initialCode]);

  const change = (field: PromoField) => (text: string) => {
    setInput((now) => ({ ...now, [field]: text }));
    setError(null);
  };

  const save = async () => {
    if (!product || busy.current) return;
    const built = buildPromoRule(kind, input, product.priceCents);
    if ('error' in built) {
      setError({ field: built.field, text: built.error });
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      await savePromotion(db, { code: product.code, rule: built.rule, active });
      notify(exists ? 'Promoción guardada' : 'Promoción creada');
      router.back();
    } catch (failure) {
      busy.current = false;
      setSaving(false);
      setError({
        text: failure instanceof MissingPromoProductError ? 'Este producto ya no está guardado.' : 'No se pudo guardar. Inténtalo otra vez.',
      });
    }
  };

  const remove = async () => {
    if (!product || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await deletePromotion(db, product.code);
      notify('Promoción eliminada');
      router.back();
    } catch {
      busy.current = false;
      setSaving(false);
      Alert.alert('No se pudo eliminar', 'La promoción sigue guardada. Inténtalo otra vez.');
    }
  };

  const confirmDelete = () => {
    Alert.alert('¿Eliminar esta promoción?', 'El producto se cobrará a su precio normal.', [
      { text: 'Conservar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: remove },
    ]);
  };

  const title = exists ? 'Cambiar promoción' : 'Nueva promoción';

  if (loading) {
    return (
      <Page top={false} bottom>
        <Stack.Screen options={{ title }} />
        <AppText variant="muted">Cargando…</AppText>
      </Page>
    );
  }

  if (!product) {
    return (
      <Page top={false} bottom>
        <Stack.Screen options={{ title }} />
        <AppText variant="heading">¿A qué producto?</AppText>
        <View style={styles.search}>
          <Icon name="search" color={colors.muted} />
          <TextInput
            autoFocus
            accessibilityLabel="Buscar producto"
            autoCorrect={false}
            maxFontSizeMultiplier={1.5}
            placeholder="Buscar por nombre o código"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
          />
        </View>
        <View style={styles.results}>
          {results?.map((item) => <ProductRow key={item.code} product={item} onOpen={choose} />)}
        </View>
        {results && results.length === 0 ? (
          <AppText variant="muted">
            {query.trim() ? `No hay productos con “${query.trim()}”.` : 'Primero guarda productos en la pestaña Productos.'}
          </AppText>
        ) : null}
        {results && results.length >= PICKER_LIMIT ? (
          <AppText variant="small">Se muestran los primeros {PICKER_LIMIT}. Escribe para buscar uno en específico.</AppText>
        ) : null}
      </Page>
    );
  }

  const built = buildPromoRule(kind, input, product.priceCents);
  const preview = 'rule' in built ? built.rule : null;
  const example = preview ? priceLine(product.priceCents, exampleQty(preview), preview) : null;
  const fieldError = (field: PromoField) => (error?.field === field ? error.text : undefined);

  return (
    <Page top={false} bottom>
      <Stack.Screen options={{ title }} />
      <View style={styles.productCard}>
        <AppText variant="strong" numberOfLines={2}>{product.name}</AppText>
        <AppText variant="small">
          Precio normal {formatCents(product.priceCents)}  ·  {product.code}
        </AppText>
        {!initialCode ? <Button label="Elegir otro producto" variant="ghost" compact onPress={() => setProduct(null)} /> : null}
      </View>

      <AppText variant="heading">Tipo de promoción</AppText>
      <View style={styles.kinds}>
        {PROMO_KINDS.map((option) => (
          <Button
            key={option}
            label={PROMO_KIND_NAMES[option]}
            variant={option === kind ? 'primary' : 'secondary'}
            compact
            onPress={() => {
              setKind(option);
              setError(null);
            }}
          />
        ))}
      </View>
      <AppText variant="muted">{KIND_HELP[kind]}</AppText>

      {kind === 'bundle' ? (
        <View style={styles.pair}>
          <View style={styles.pairItem}>
            <Field label="Piezas" keyboardType="number-pad" placeholder="3" value={input.qty} onChangeText={change('qty')} error={fieldError('qty')} />
          </View>
          <View style={styles.pairItem}>
            <Field label="Por" prefix="$" keyboardType="decimal-pad" placeholder="25.00" value={input.price} onChangeText={change('price')} error={fieldError('price')} />
          </View>
        </View>
      ) : null}
      {kind === 'nxm' ? (
        <View style={styles.pair}>
          <View style={styles.pairItem}>
            <Field label="Lleva" keyboardType="number-pad" placeholder="2" value={input.take} onChangeText={change('take')} error={fieldError('take')} />
          </View>
          <View style={styles.pairItem}>
            <Field label="Paga" keyboardType="number-pad" placeholder="1" value={input.pay} onChangeText={change('pay')} error={fieldError('pay')} />
          </View>
        </View>
      ) : null}
      {kind === 'percent' ? (
        <Field label="Descuento (%)" keyboardType="number-pad" placeholder="10" value={input.percent} onChangeText={change('percent')} error={fieldError('percent')} />
      ) : null}
      {kind === 'sale' ? (
        <Field large label="Precio de oferta" prefix="$" keyboardType="decimal-pad" placeholder="0.00" value={input.price} onChangeText={change('price')} error={fieldError('price')} />
      ) : null}

      {preview && example ? (
        <View style={styles.preview} accessibilityLiveRegion="polite">
          <AppText variant="strong">{describePromo(preview)}</AppText>
          <AppText>
            {pieces(exampleQty(preview))}: {formatCents(example.totalCents)} en lugar de {formatCents(example.regularCents)}. El cliente ahorra{' '}
            {formatCents(example.savingsCents)}.
          </AppText>
        </View>
      ) : null}

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <AppText variant="strong">Promoción encendida</AppText>
          <AppText variant="small">Apágala para dejar de aplicarla sin borrarla.</AppText>
        </View>
        <Switch
          accessibilityLabel="Promoción encendida"
          value={active}
          onValueChange={setActive}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={active ? colors.accent : colors.surface}
          ios_backgroundColor={colors.border}
        />
      </View>

      {error && !error.field ? <AppText variant="error">{error.text}</AppText> : null}
      <View style={styles.actions}>
        <Button label={exists ? 'Guardar cambios' : 'Crear promoción'} large loading={saving} onPress={save} />
        {exists ? <Button label="Eliminar promoción" variant="danger" disabled={saving} onPress={confirmDelete} /> : null}
      </View>
    </Page>
  );
}

const useStyles = makeStyles((colors) => ({
  search: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md + 2,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, color: colors.ink, paddingVertical: space.sm },
  results: { borderRadius: radius.md, overflow: 'hidden' },
  productCard: { gap: space.xs, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'flex-start' },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pair: { flexDirection: 'row', gap: space.md },
  pairItem: { flex: 1 },
  preview: { gap: space.xs, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  switchText: { flex: 1, gap: 2 },
  actions: { marginTop: 'auto', paddingTop: space.sm, gap: space.sm + 2 },
}));
