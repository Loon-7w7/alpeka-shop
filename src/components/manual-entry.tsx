import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';

import { useLayout } from '@/hooks/use-layout';
import { isValidBarcode, normalizeBarcode } from '@/lib/barcode';
import { makeStyles, space } from '@/theme';
import { AppText } from './app-text';
import { Button } from './button';
import { Field } from './field';

type Props = { visible: boolean; onClose: () => void; onSubmit: (code: string) => void };

export function ManualEntry({ visible, onClose, onSubmit }: Props) {
  const styles = useStyles();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const { insets, gutter, contentWidth, height } = useLayout();

  const close = () => {
    setValue('');
    setError(undefined);
    onClose();
  };

  const submit = () => {
    const code = normalizeBarcode(value);
    if (!isValidBarcode(code)) {
      setError('Escribe el número completo que aparece debajo de las barras.');
      return;
    }
    setValue('');
    setError(undefined);
    onSubmit(code);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}>
        <Pressable accessibilityLabel="Cerrar" style={styles.dismiss} onPress={close} />
        {/* Con teclado abierto en pantallas bajas u horizontal, la hoja se puede desplazar en vez de quedar tapada. */}
        <ScrollView
          style={[styles.sheet, { maxHeight: height * 0.9 }]}
          contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + space.lg, paddingHorizontal: gutter }]}
          keyboardShouldPersistTaps="handled"
          bounces={false}>
          <View style={[styles.inner, { width: contentWidth }]}>
            <AppText variant="heading" accessibilityRole="header">Escribir el código</AppText>
            <Field
              autoFocus
              label="Son los números debajo de las barras"
              error={error}
              keyboardType="number-pad"
              returnKeyType="search"
              value={value}
              onChangeText={(text) => {
                setValue(text);
                setError(undefined);
              }}
              onSubmitEditing={submit}
            />
            <Button label="Buscar precio" onPress={submit} />
            <Button label="Cancelar" variant="ghost" onPress={close} />
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
}));
