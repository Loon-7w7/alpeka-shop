import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Page } from '@/components/page';
import { deleteProduct, DuplicateCodeError, getProduct, saveProduct } from '@/db/products';
import { isValidBarcode, normalizeBarcode } from '@/lib/barcode';
import { centsToInput, parsePriceToCents } from '@/lib/money';
import { notify } from '@/lib/notify';
import { colors, radius, space } from '@/theme';

type Errors = { code?: string; name?: string; price?: string; form?: string };

export default function ProductForm() {
  const params = useLocalSearchParams<{ codigo?: string; modo?: string; desdeEscaneo?: string; nombre?: string }>();
  const editing = params.modo === 'editar' && !!params.codigo;
  const db = useSQLiteContext();
  const [code, setCode] = useState(params.codigo ?? '');
  const [name, setName] = useState(params.nombre ?? '');
  const [price, setPrice] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const priceRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (!editing || !params.codigo) return;
    getProduct(db, params.codigo).then((product) => {
      if (!product) return;
      setName(product.name);
      setPrice(centsToInput(product.priceCents));
    });
  }, [db, editing, params.codigo]);

  const save = async () => {
    const cleanCode = normalizeBarcode(code);
    const cents = parsePriceToCents(price);
    const next: Errors = {
      code: isValidBarcode(cleanCode) ? undefined : 'Escribe o escanea el código completo.',
      name: name.trim() ? undefined : 'Escribe el nombre del producto.',
      price: cents ? undefined : 'Escribe un precio mayor a cero, por ejemplo 28.50.',
    };
    setErrors(next);
    if (next.code || next.name || next.price || !cents) return;
    setSaving(true);
    try {
      await saveProduct(db, {
        originalCode: editing ? params.codigo : undefined,
        code: cleanCode,
        name,
        priceCents: cents,
      });
      notify(editing ? 'Cambios guardados' : 'Producto guardado');
      router.dismissTo({ pathname: '/producto/[codigo]', params: { codigo: cleanCode } });
    } catch (error) {
      setErrors(
        error instanceof DuplicateCodeError
          ? { code: 'Ese código ya está guardado en otro producto.' }
          : { form: 'No se pudo guardar. Inténtalo otra vez.' },
      );
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('¿Eliminar este producto?', 'Se borrará de este teléfono.', [
      { text: 'Conservar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          if (!params.codigo) return;
          await deleteProduct(db, params.codigo);
          notify('Producto eliminado');
          router.dismissTo('/productos');
        },
      },
    ]);
  };

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
        maxLength={120}
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
        {editing ? <Button label="Eliminar producto" variant="danger" onPress={confirmDelete} /> : null}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  notice: { padding: space.lg - 2, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  actions: { marginTop: 'auto', paddingTop: space.sm, gap: space.sm + 2 },
});
