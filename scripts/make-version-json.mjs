// Crea version.json para adjuntarlo al Release de GitHub junto con el APK.
// Uso: node scripts/make-version-json.mjs <ruta-al-apk> <usuario/repositorio> ["Notas de la versión"]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const [apk, repo, notes] = process.argv.slice(2);
if (!apk || !repo) fail('Uso: node scripts/make-version-json.mjs <ruta-al-apk> <usuario/repositorio> ["Notas"]');
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail(`"${repo}" no tiene la forma usuario/repositorio.`);
if (!existsSync(apk)) fail(`No existe el archivo ${apk}.`);
if (!apk.endsWith('.apk')) fail(`${apk} no es un .apk.`);

const { version } = JSON.parse(readFileSync('app.json', 'utf8')).expo;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`La versión "${version}" de app.json debe ser como 1.2.3.`);

const manifest = {
  version,
  url: `https://github.com/${repo}/releases/download/v${version}/${basename(apk)}`,
  sha256: createHash('sha256').update(readFileSync(apk)).digest('hex'),
  ...(notes ? { notes: notes.slice(0, 300) } : {}),
};
writeFileSync('version.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`version.json listo para v${version}. Crea el Release con el tag exacto v${version} y adjunta version.json y ${basename(apk)}.`);
