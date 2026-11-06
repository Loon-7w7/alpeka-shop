// Crea version.json para adjuntarlo al Release de GitHub junto con el APK.
// Uso: node scripts/make-version-json.mjs <ruta-al-apk> <usuario/repositorio> ["Notas de la versión"]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const [apk, repo, notes] = process.argv.slice(2);
if (!apk || !repo?.includes('/')) {
  console.error('Uso: node scripts/make-version-json.mjs <ruta-al-apk> <usuario/repositorio> ["Notas"]');
  process.exit(1);
}
const { version } = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const manifest = {
  version,
  url: `https://github.com/${repo}/releases/download/v${version}/${basename(apk)}`,
  sha256: createHash('sha256').update(readFileSync(apk)).digest('hex'),
  ...(notes ? { notes } : {}),
};
writeFileSync('version.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`version.json listo para v${version}. Adjunta version.json y ${basename(apk)} al Release v${version}.`);
