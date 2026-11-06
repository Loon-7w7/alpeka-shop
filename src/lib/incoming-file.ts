/**
 * Cuando alguien toca un archivo en WhatsApp, el correo o "Archivos" y elige "Abrir con Alpeka Shop",
 * Android abre la app con una dirección `content://…` (o `file://…` en teléfonos viejos).
 * Esa dirección no es una pantalla: se manda a "Recibir productos" con el archivo como parámetro.
 * Cualquier otra dirección (por ejemplo `alpekashop://…`) se deja igual.
 */
export function routeForIncoming(path: string): string {
  if (/^(content|file):\/\//i.test(path.trim())) return `/recibir?archivo=${encodeURIComponent(path.trim())}`;
  return path;
}
