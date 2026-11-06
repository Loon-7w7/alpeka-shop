# Alpeka Shop

App para que el cajero de una tienda pequeña escanee un código de barras y vea cuánto cobrar. Los precios se guardan solo en el teléfono y funciona sin internet.

Hecha con Expo SDK 58, React Native 0.88, Expo Router y SQLite.

## Pasar productos a otro teléfono

1. En el teléfono que tiene los productos: **Productos → Compartir** (o Ajustes → Compartir productos) y mándalo por WhatsApp, correo o Bluetooth.
2. En el otro teléfono: toca el archivo y elige **Abrir con Alpeka Shop** (o Ajustes → Recibir productos → Elegir archivo).
3. Revisa el resumen y toca **Agregar a mis productos**.

El código de barras identifica cada producto. Los nuevos se agregan; si el mismo código ya existe con otro precio o nombre, gana el que se cambió más recientemente. No se borra nada, y **Ajustes → Deshacer el último cambio** regresa la lista a como estaba. La lógica está en `src/services/product-merge.ts`.

"Recuperar un respaldo" es distinto: **reemplaza** toda la lista por la del archivo.

## Probar en desarrollo

```bash
npm install
npm test            # Lógica y base de datos
npm run typecheck
npm run lint
npm run web         # Solo para revisar pantallas; usa datos de prueba y no lee códigos
```

La app no abre en Expo Go con todas sus funciones. Para probarla en un teléfono, instala el APK.

## Primer APK

1. Crea una cuenta gratis en [expo.dev](https://expo.dev) e inicia sesión: `npx eas-cli@latest login`.
2. Vincula el proyecto: `npx eas-cli@latest init`.
3. En `eas.json`, cambia `TU_USUARIO` por tu usuario de GitHub. Si el repositorio tiene otro nombre, cámbialo también.
4. Revisa `android.package` en `app.json`. Ahora es `com.alpeka.shop` y no debe cambiar después de instalar la app.
5. Genera el APK: `npm run build:apk`. La primera vez, deja que EAS cree la clave de firma.
6. Descarga el APK desde el enlace que muestra EAS y cópialo a la carpeta del proyecto.

EAS guarda la clave de firma. Descarga una copia con `npx eas-cli@latest credentials` y guárdala fuera de GitHub. Sin esa clave no se puede actualizar la app sin desinstalarla.

## Publicar una actualización

Hay dos caminos según lo que cambió.

### Cambios de pantallas, textos o lógica: EAS Update (automático)

Haz `git push` a `main`. El workflow `.eas/workflows/publish-update.yml` publica un update en el canal `production`. La app lo descarga en segundo plano y lo aplica la próxima vez que se abre, sin interrumpir al cajero.

En [expo.dev](https://expo.dev/accounts/alpeka/projects/alpeka-shop) → **Updates** ves cada update, a qué APK llega y puedes revertirlo. En **Workflows** ves cada publicación.

Para que el workflow corra, el repositorio tiene que estar vinculado una vez: en expo.dev → proyecto → **Project settings → GitHub**, conecta `Loon-7w7/alpeka-shop`.

Para publicar a mano: `npx eas-cli@latest update --channel production --environment production --platform android --message "Qué cambió"`.

### Cambios nativos: APK nuevo por GitHub Releases

Si agregaste una librería con código nativo, cambiaste permisos o plugins en `app.json`, o actualizaste el SDK, el update no llega a los APK viejos (el `runtimeVersion` es un fingerprint de la parte nativa). Hace falta un APK nuevo:

1. Sube `version` en `app.json`, por ejemplo de `1.0.0` a `1.1.0`.
2. Genera el APK: `npm run build:apk`.
3. Crea el archivo de versión:

   ```bash
   node scripts/make-version-json.mjs alpeka-shop.apk Loon-7w7/alpeka-shop "Qué cambió"
   ```

4. Crea un Release llamado exactamente `v1.1.0` y adjunta `alpeka-shop.apk` y `version.json`:

   ```bash
   gh release create v1.1.0 alpeka-shop.apk version.json --title "Alpeka Shop 1.1.0" --notes "Qué cambió"
   ```

Al abrirse con internet, la app lee el `version.json` del Release más reciente y avisa si hay una versión mayor. El cajero toca Instalar y confirma en el instalador de Android. La primera vez, Android pedirá autorizar a Alpeka Shop para instalar apps.

El repositorio de los Releases debe ser público, porque la app descarga sin iniciar sesión. Nunca subas la clave de firma ni sus contraseñas.

## Estructura

- `src/app`: pantallas y rutas.
- `src/components`: piezas de interfaz.
- `src/db`: SQLite, migraciones y consultas. Agrega los cambios de tablas al final de `migrations.ts` y nunca edites una migración publicada.
- `src/services`: respaldos y actualizaciones.
- `src/lib`: códigos de barras, dinero y versiones.
- `tests/web`: sustitutos que solo se usan en el navegador; no entran al APK.
