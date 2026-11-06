import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { useLayout } from '@/hooks/use-layout';
import { isValidBarcode, normalizeBarcode } from '@/lib/barcode';
import { colors, space } from '@/theme';
import { AppText } from './app-text';
import { Button } from './button';
import { Field } from './field';

type Props = { visible: boolean; onClose: () => void; onSubmit: (code: string) => void };

export function ManualEntry({ visible, onClose, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const { insets, gutter, contentWidth } = useLayout();

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
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg, paddingHorizontal: gutter }]}>
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8,20,17,0.6)' },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: space.xl,
    alignItems: 'center',
  },
  inner: { gap: space.md },
});
