import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef } from 'react';

import { getSetting, scanSoundOn } from '@/db/settings';

const BEEP = require('../../assets/sounds/scanner-beep.mp3');

// Se configura una sola vez para toda la app.
let audioMode: Promise<void> | null = null;
function configureAudio() {
  audioMode ??= setAudioModeAsync({
    // En modo silencio o vibrar no suena: solo queda la vibración.
    playsInSilentMode: false,
    // Un efecto corto: no pausa la música ni otras apps.
    interruptionMode: 'mixWithOthers',
  }).catch(() => {
    audioMode = null;
  });
}

/**
 * Regresa una función que reproduce el beep del escáner.
 * Lee el ajuste "Sonido al escanear" cada vez que la pantalla se muestra, así un cambio en Ajustes aplica al volver.
 */
export function useScanBeep() {
  const db = useSQLiteContext();
  const player = useAudioPlayer(BEEP);
  const enabled = useRef(true);

  useFocusEffect(
    useCallback(() => {
      configureAudio();
      let current = true;
      getSetting(db, 'scan_sound').then(
        (value) => {
          if (current) enabled.current = scanSoundOn(value);
        },
        // Si no se puede leer, se conserva lo último conocido.
        () => undefined,
      );
      return () => {
        current = false;
      };
    }, [db]),
  );

  return useCallback(() => {
    if (!enabled.current) return;
    try {
      // Desde el inicio, aunque el beep anterior no haya terminado (escaneos seguidos).
      player.seekTo(0).catch(() => undefined);
      player.play();
    } catch {
      // Sin sonido el escaneo sigue funcionando: también vibra.
    }
  }, [player]);
}
