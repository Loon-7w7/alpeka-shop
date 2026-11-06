// Genera los PNG de assets/ a partir de estos dibujos. Solo hace falta si cambias el icono.
// Requiere Playwright con Chromium: npx playwright install chromium && node scripts/generate-assets.mjs
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const icons = {
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M14 8v8M17 8v8',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  flash: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  keypad: 'M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10',
  check: 'M20 6L9 17l-5-5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01',
  cart: 'M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM20 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6',
  minus: 'M5 12h14',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
};

const PINK = '#F59FBF', CREAM = '#FFF6EA', MUZZLE = '#F6E3CC', INK = '#12302B', AMBER = '#FFC83D';

function alpaca({ fur = CREAM, muzzle = MUZZLE, ink = INK, inner = PINK, tag = AMBER, hole = PINK, bottom = 100 } = {}) {
  return `
    <path d="M30 ${bottom}V70Q30 58 50 58Q70 58 70 70V${bottom}Z" fill="${fur}"/>
    <circle cx="30" cy="78" r="7" fill="${fur}"/><circle cx="70" cy="78" r="7" fill="${fur}"/>
    <circle cx="29" cy="92" r="7" fill="${fur}"/><circle cx="71" cy="92" r="7" fill="${fur}"/>
    <ellipse cx="34" cy="22" rx="6" ry="13" transform="rotate(-18 34 22)" fill="${fur}"/>
    <ellipse cx="34" cy="23" rx="3" ry="8" transform="rotate(-18 34 23)" fill="${inner}"/>
    <ellipse cx="66" cy="22" rx="6" ry="13" transform="rotate(18 66 22)" fill="${fur}"/>
    <ellipse cx="66" cy="23" rx="3" ry="8" transform="rotate(18 66 23)" fill="${inner}"/>
    <circle cx="38" cy="30" r="9" fill="${fur}"/><circle cx="50" cy="25" r="11" fill="${fur}"/><circle cx="62" cy="30" r="9" fill="${fur}"/>
    <ellipse cx="50" cy="47" rx="21" ry="22" fill="${fur}"/>
    <ellipse cx="50" cy="56" rx="11" ry="9" fill="${muzzle}"/>
    <ellipse cx="41" cy="45" rx="2.6" ry="3.4" fill="${ink}"/><ellipse cx="59" cy="45" rx="2.6" ry="3.4" fill="${ink}"/>
    <path d="M47.5 53h5l-2.5 2.5z" fill="${ink}"/>
    <path d="M50 55.5v2.5M50 58q-2.5 2.5-5 1M50 58q2.5 2.5 5 1" fill="none" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M70 28L78 38" fill="none" stroke="${ink}" stroke-width="1"/>
    <path d="M72 42L78 36L84 42V58H72Z" fill="${tag}"/>
    <circle cx="78" cy="42" r="1.6" fill="${hole}"/>
    <path d="M78 46.2v8.6M80.2 47.8c-.5-.9-1.2-1.2-2.2-1.2-1.3 0-2.2.7-2.2 1.8 0 2.6 4.5 1.3 4.5 3.9 0 1.1-1 1.8-2.3 1.8-1.1 0-2-.4-2.5-1.4" fill="none" stroke="${ink}" stroke-width="0.9" stroke-linecap="round"/>`;
}

const svg = (viewBox, body, bg = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${bg}${body}</svg>`;

const files = {
  'assets/images/icon.png': [1024, svg('0 0 100 100', alpaca(), `<rect width="100" height="100" fill="${PINK}"/>`)],
  'assets/images/android-icon-foreground.png': [1024, svg('-25 -28 150 150', alpaca({ bottom: 130 }))],
  'assets/images/android-icon-monochrome.png': [1024, svg('-25 -28 150 150', alpaca({ fur: '#000', muzzle: '#000', ink: 'transparent', inner: 'transparent', tag: '#000', hole: 'transparent', bottom: 130 }))],
  'assets/images/splash-icon.png': [512, svg('0 0 100 100', alpaca({ bottom: 100 }))],
  'assets/images/alpaca.png': [840, svg('0 0 100 100', alpaca())],
  'assets/images/favicon.png': [64, svg('0 0 100 100', alpaca(), `<rect width="100" height="100" fill="${PINK}"/>`)],
};
for (const [name, d] of Object.entries(icons)) {
  files[`assets/icons/${name}.png`] = [96, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`];
}

mkdirSync('assets/images', { recursive: true });
mkdirSync('assets/icons', { recursive: true });
const browser = await chromium.launch();
for (const [path, [size, markup]] of Object.entries(files)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.screenshot({ path, omitBackground: true });
  await page.close();
}
await browser.close();
