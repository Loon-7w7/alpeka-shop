import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';

import { noteKey, type PriceNote } from '@/db/notes';
import { useLayout } from '@/hooks/use-layout';
import { parsePriceToCents } from '@/lib/money';
import { makeStyles, space } from '@/theme';
import { AppText } from './app-text';
import { Button } from './button';
import { Field } from './field';
import { NoteRow } from './note-row';

const NOTES_SHOWN = 8;

type Props = {
  visible: boolean;
  title: string;
  /** Texto bajo el título, por ejemplo el código que no está registrado. */
  subtitle?: string;
  onClose: () => void;
  onSubmit: (item: { name: string; priceCents: number }) => void;
  /** Notas de precio (verduras por kilo…) para consultar mientras se cobra. Solo se muestran: no se suman. */
  notes?: readonly PriceNote[];
};

/** Pide un precio para sumarlo a la cuenta. No guarda ningún producto. */
export function PriceEntry({ visible, title, subtitle, onClose, onSubmit, notes = [] }: Props) {
  const styles = useStyles();
  const [price, setPrice] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const { insets, gutter, contentWidth, height } = useLayout();

  const reset = () => {
    setPrice('');
    setName('');
    setError(undefined);
  };

  // Al escribir la descripción se filtran las notas, para encontrar rápido "tomate".
  const term = noteKey(name);
  const matching = term ? notes.filter((note) => noteKey(note.name).includes(term)) : notes;
  const shown = matching.slice(0, NOTES_SHOWN);

  const close = () => {
    reset();
    onClose();
  };

  const submit = () => {
    const cents = parsePriceToCents(price);
    if (cents === null) {
      setError('Escribe un precio válido, por ejemplo 25 o 25.50.');
      return;
    }
    const label = name.trim();
    reset();
    onSubmit({ name: label, priceCents: cents });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}>
        <Pressable accessibilityLabel="Cerrar" style={styles.dismiss} onPress={close} />
        <ScrollView
          style={[styles.sheet, { maxHeight: height * 0.9 }]}
          contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + space.lg, paddingHorizontal: gutter }]}
          keyboardShouldPersistTaps="handled"
          bounces={false}>
          <View style={[styles.inner, { width: contentWidth }]}>
            <View>
              <AppText variant="heading" accessibilityRole="header">{title}</AppText>
              {subtitle ? <AppText variant="muted">{subtitle}</AppText> : null}
            </View>
            <Field
              autoFocus
              large
              prefix="$"
              label="Precio"
              placeholder="0.00"
              error={error}
              keyboardType="decimal-pad"
              returnKeyType="done"
              value={price}
              onChangeText={(text) => {
                setPrice(text);
                setError(undefined);
              }}
              onSubmitEditing={submit}
            />
            <Field
              label="Descripción (opcional)"
              placeholder="Ej. Dulces sueltos"
              maxLength={60}
              returnKeyType="done"
              value={name}
              onChangeText={setName}
              onSubmitEditing={submit}
            />
            <AppText variant="small">Solo se suma a esta cuenta. No se guarda en tus productos.</AppText>
            <Button label="Sumar a la cuenta" icon="plus" onPress={submit} />
            <Button label="Cancelar" variant="ghost" onPress={close} />
            {notes.length ? (
              <View style={styles.notes}>
                <AppText variant="strong" accessibilityRole="header">Notas de precio</AppText>
                <AppText variant="small">Solo para consultar. Escribe arriba el total a cobrar.</AppText>
                {shown.length ? (
                  <View style={styles.noteList}>
                    {shown.map((note) => (
                      <NoteRow key={noteKey(note.name)} note={note} />
                    ))}
                  </View>
                ) : (
                  <AppText variant="muted">No hay notas con “{name.trim()}”.</AppText>
                )}
                {matching.length > shown.length ? (
                  <AppText variant="small">Escribe en Descripción para ver las demás ({matching.length - shown.length} más).</AppText>
                ) : null}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8,20,17,0.6)' },
  dismiss: { flex: 1 },
  sheet: {
    flexGrow: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetContent: { paddingTop: space.xl, alignItems: 'center' },
  inner: { gap: space.md },
  notes: { gap: space.sm, paddingTop: space.sm },
  noteList: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
}));
