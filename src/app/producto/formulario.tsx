import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Page } from '@/components/page';
import { deleteProduct, DuplicateCodeError, findProduct, getProduct, MissingProductError, NAME_MAX, saveProduct } from '@/db/products';
import { barcodeCandidates, isValidBarcode, normalizeBarcode } from '@/lib/barcode';
import { centsToInput, parsePriceToCents } from '@/lib/money';
import { notify } from '@/lib/notify';
import { colors, radius, space } from '@/theme';

type Errors = { code?: string; name?: string; price?: string; form?: string };
type Params = { codigo?: string; modo?: string; desdeEscaneo?: string; nombre?: string };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function ProductForm() {
  const raw = useLocalSearchParams<Params>();
  const params: Params = { codigo: first(raw.codigo), modo: first(raw.modo), desdeEscaneo: first(raw.desdeEscaneo), nombre: first(raw.nombre) };
  const editing = params.modo === 'editar' && !!params.codigo;
  const db = useSQLiteContext();
  const [code, setCode] = useState(params.codigo ?? '');
  const [name, setName] = useState(params.nombre ?? '');
  const [price, setPrice] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Evita doble guardado: el "Listo" del teclado no pasa por el botón deshabilitado.
  const busy = useRef(false);
  const priceRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (!editing || !params.codigo) return;
    let current = true;
    getProduct(db, params.codigo).then(
      (product) => {
        if (!current) return;
        if (!product) {
          notify('Este producto ya no está guardado');
          router.back();
          return;
        }
        setName(product.name);
        setPrice(centsToInput(product.priceCents));
      },
      () => {
        if (current) setLoadFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [db, editing, params.codigo]);

  const save = async () => {
    if (busy.current || loadFailed) return;
    const cleanCode = normalizeBarcode(code);
    const cents = parsePriceToCents(price);
    const next: Errors = {
      code: isValidBarcode(cleanCode) ? undefined : 'Escribe o escanea el código completo.',
      name: name.trim() ? undefined : 'Escribe el nombre del producto.',
      price: cents ? undefined : 'Escribe un precio mayor a cero, por ejemplo 28.50.',
    };
    setErrors(next);
    if (next.code || next.name || next.price || !cents) return;
    busy.current = true;
    setSaving(true);
    try {
      if (cleanCode !== params.codigo) {
        // Un UPC-E tecleado (8 dígitos) y el mismo escaneado (13) son el mismo producto.
        const twin = await findProduct(db, barcodeCandidates(cleanCode).filter((c) => c !== params.codigo));
        if (twin) throw new DuplicateCodeError();
      }
      await saveProduct(db, {
        originalCode: editing ? params.codigo : undefined,
        code: cleanCode,
        name,
        priceCents: cents,
      });
      notify(editing ? 'Cambios guardados' : 'Producto guardado');
      if (editing) router.dismissTo({ pathname: '/producto/[codigo]', params: { codigo: cleanCode } });
      // Producto nuevo: el formulario se reemplaza para que "atrás" no regrese a él.
      else router.replace({ pathname: '/producto/[codigo]', params: { codigo: cleanCode } });
    } catch (error) {
      setErrors(
        error instanceof DuplicateCodeError
          ? { code: 'Ese código ya está guardado en otro producto.' }
          : error instanceof MissingProductError
            ? { form: 'Este producto ya no está guardado. Vuelve y agrégalo de nuevo.' }
            : { form: 'No se pudo guardar. Inténtalo otra vez.' },
      );
      busy.current = false;
      setSaving(false);
    }
  };

  const remove = async () => {
    if (busy.current || !params.codigo) return;
    busy.current = true;
    setSaving(true);
    try {
      await deleteProduct(db, params.codigo);
      notify('Producto eliminado');
      router.dismissTo('/productos');
    } catch {
      busy.current = false;
      setSaving(false);
      Alert.alert('No se pudo eliminar', 'El producto sigue guardado. Inténtalo otra vez.');
    }
  };

  const confirmDelete = () => {
    Alert.alert('¿Eliminar este producto?', 'Se borrará de este teléfono.', [
      { text: 'Conservar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: remove },
    ]);
  };

  if (loadFailed) {
    return (
      <Page top={false} bottom>
        <Stack.Screen options={{ title: 'Cambiar producto' }} />
        <AppText variant="heading">No se pudo abrir el producto</AppText>
        <AppText>Tus datos siguen guardados. Vuelve e inténtalo otra vez.</AppText>
        <Button label="Volver" onPress={() => router.back()} />
      </Page>
    );
  }

  return (
    <Page top={false} bottom>
      <Stack.Screen options={{ title: editing ? 'Cambiar producto' : 'Producto nuevo' }} />
      {params.desdeEscaneo ? (
        <View style={styles.notice}>
          <AppText>
            <AppText variant="strong">Este código aún no está guardado.</AppText> Agrégalo una vez y la próxima vez el precio saldrá solo.
          </AppText>
        </View>
      ) : null}
      <Field
        label="Código de barras"
        autoCapitalize="characters"
        autoCorrect={false}
        error={errors.code}
        placeholder="Escribe el número"
        returnKeyType="next"
        value={code}
        onChangeText={(text) => {
          setCode(text);
          setErrors((current) => ({ ...current, code: undefined }));
        }}
      />
      <Field
        autoFocus={!editing && !params.nombre}
        label="Nombre del producto"
        autoCapitalize="sentences"
        error={errors.name}
        maxLength={NAME_MAX}
        placeholder="Ej. Leche entera 1 L"
        returnKeyType="next"
        submitBehavior="submit"
        value={name}
        onChangeText={(text) => {
          setName(text);
          setErrors((current) => ({ ...current, name: undefined }));
        }}
        onSubmitEditing={() => priceRef.current?.focus()}
      />
      <Field
        ref={priceRef}
        large
        prefix="$"
        label="Precio"
        keyboardType="decimal-pad"
        error={errors.price}
        placeholder="0.00"
        returnKeyType="done"
        value={price}
        onChangeText={(text) => {
          setPrice(text);
          setErrors((current) => ({ ...current, price: undefined }));
        }}
        onSubmitEditing={save}
      />
      {errors.form ? <AppText variant="error">{errors.form}</AppText> : null}
      <View style={styles.actions}>
        <Button label={editing ? 'Guardar cambios' : 'Guardar producto'} large loading={saving} onPress={save} />
        {editing ? <Button label="Eliminar producto" variant="danger" disabled={saving} onPress={confirmDelete} /> : null}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  notice: { padding: space.lg - 2, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  actions: { marginTop: 'auto', paddingTop: space.sm, gap: space.sm + 2 },
});
