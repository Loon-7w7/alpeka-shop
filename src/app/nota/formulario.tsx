import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Page } from '@/components/page';
import {
  deleteNote, DuplicateNoteError, getNote, MissingNoteError, NOTE_NAME_MAX, NOTE_UNITS, saveNote, unitLabel, type NoteUnit,
} from '@/db/notes';
import { centsToInput, parsePriceToCents } from '@/lib/money';
import { notify } from '@/lib/notify';
import { makeStyles, radius, space } from '@/theme';

type Errors = { name?: string; price?: string; form?: string };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Nota de precio para algo sin código (verduras por kilo, etc.).
 * Solo se consulta: no se suma a la cuenta; al cobrar se usa "Precio suelto".
 */
export default function NoteForm() {
  const styles = useStyles();
  const raw = useLocalSearchParams<{ clave?: string; nombre?: string }>();
  const originalKey = first(raw.clave) || undefined;
  const editing = !!originalKey;
  const db = useSQLiteContext();
  const [name, setName] = useState(first(raw.nombre) ?? '');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState<NoteUnit>('kilo');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Evita doble guardado: el "Listo" del teclado no pasa por el botón deshabilitado.
  const busy = useRef(false);
  const priceRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (!originalKey) return;
    let current = true;
    getNote(db, originalKey).then(
      (note) => {
        if (!current) return;
        if (!note) {
          notify('Esta nota ya no está guardada');
          router.back();
          return;
        }
        setName(note.name);
        setPrice(centsToInput(note.priceCents));
        setUnit(note.unit);
      },
      () => {
        if (current) setLoadFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [db, originalKey]);

  const save = async () => {
    if (busy.current || loadFailed) return;
    const cents = parsePriceToCents(price);
    const next: Errors = {
      name: name.trim() ? undefined : 'Escribe qué es, por ejemplo Tomate.',
      price: cents ? undefined : 'Escribe un precio mayor a cero, por ejemplo 35 o 35.50.',
    };
    setErrors(next);
    if (next.name || next.price || !cents) return;
    busy.current = true;
    setSaving(true);
    try {
      await saveNote(db, { originalKey, name, priceCents: cents, unit });
      notify(editing ? 'Nota guardada' : 'Nota agregada');
      router.back();
    } catch (error) {
      setErrors(
        error instanceof DuplicateNoteError
          ? { name: 'Ya tienes una nota con ese nombre.' }
          : error instanceof MissingNoteError
            ? { form: 'Esta nota ya no está guardada. Vuelve y agrégala de nuevo.' }
            : { form: 'No se pudo guardar. Inténtalo otra vez.' },
      );
      busy.current = false;
      setSaving(false);
    }
  };

  const remove = async () => {
    if (busy.current || !originalKey) return;
    busy.current = true;
    setSaving(true);
    try {
      await deleteNote(db, originalKey);
      notify('Nota eliminada');
      router.back();
    } catch {
      busy.current = false;
      setSaving(false);
      Alert.alert('No se pudo eliminar', 'La nota sigue guardada. Inténtalo otra vez.');
    }
  };

  const confirmDelete = () => {
    Alert.alert('¿Eliminar esta nota?', 'Se borrará de este teléfono.', [
      { text: 'Conservar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: remove },
    ]);
  };

  if (loadFailed) {
    return (
      <Page top={false} bottom>
        <Stack.Screen options={{ title: 'Cambiar nota' }} />
        <AppText variant="heading">No se pudo abrir la nota</AppText>
        <AppText>Tus datos siguen guardados. Vuelve e inténtalo otra vez.</AppText>
        <Button label="Volver" onPress={() => router.back()} />
      </Page>
    );
  }

  return (
    <Page top={false} bottom>
      <Stack.Screen options={{ title: editing ? 'Cambiar nota' : 'Nota nueva' }} />
      <View style={styles.notice}>
        <AppText>
          Para lo que no tiene código, como verduras por kilo. <AppText variant="strong">No se suma a la cuenta:</AppText> al cobrar
          usa “Precio suelto”, donde verás estas notas.
        </AppText>
      </View>
      <Field
        autoFocus={!editing && !name}
        label="¿Qué es?"
        autoCapitalize="sentences"
        error={errors.name}
        maxLength={NOTE_NAME_MAX}
        placeholder="Ej. Tomate"
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
      <View style={styles.units}>
        <AppText variant="strong">Se vende por</AppText>
        <View style={styles.unitRow} accessibilityRole="radiogroup">
          {NOTE_UNITS.map((option) => {
            const selected = option === unit;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Por ${option}`}
                onPress={() => setUnit(option)}
                style={[styles.unit, selected && styles.unitSelected]}>
                <AppText variant="strong" style={selected ? styles.unitTextSelected : undefined}>{option}</AppText>
              </Pressable>
            );
          })}
        </View>
        <AppText variant="small">Se mostrará como “${price.trim() || '0.00'} {unitLabel(unit)}”.</AppText>
      </View>
      {errors.form ? <AppText variant="error">{errors.form}</AppText> : null}
      <View style={styles.actions}>
        <Button label={editing ? 'Guardar cambios' : 'Guardar nota'} large loading={saving} onPress={save} />
        {editing ? <Button label="Eliminar nota" variant="danger" disabled={saving} onPress={confirmDelete} /> : null}
      </View>
    </Page>
  );
}

const useStyles = makeStyles((colors) => ({
  notice: { padding: space.lg - 2, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  units: { gap: space.sm },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  unit: {
    minHeight: 48,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unitSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  unitTextSelected: { color: colors.onPrimary },
  actions: { marginTop: 'auto', paddingTop: space.sm, gap: space.sm + 2 },
}));
