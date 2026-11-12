// Renders app/icon.svg into the PNG sizes the PWA manifest needs.
// Run: pnpm --filter @seo/web icons   (re-run when the logo changes)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(resolve(root, 'app/icon.svg'), 'utf8');
const outDir = resolve(root, 'public/icons');
mkdirSync(outDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, inset: 0, bg: 'transparent' },
  { file: 'icon-512.png', size: 512, inset: 0, bg: 'transparent' },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.1, bg: '#0D0817' },
  // Maskable icons keep the mark inside the 80% safe zone.
  { file: 'maskable-512.png', size: 512, inset: 0.2, bg: '#0D0817' },
];

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const t of targets) {
  const mark = Math.round(t.size * (1 - t.inset * 2));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<body style="margin:0;display:grid;place-items:center;width:${t.size}px;height:${t.size}px;background:${t.bg}">` +
      svg.replace('width="64" height="64"', `width="${mark}" height="${mark}"`) +
      '</body>',
  );
  await page.screenshot({ path: resolve(outDir, t.file), omitBackground: t.bg === 'transparent' });
  console.log('wrote', t.file);
}

// favicon.ico: a single 48px PNG wrapped in an ICO container (supported by all current browsers).
await page.setViewportSize({ width: 48, height: 48 });
await page.setContent(`<body style="margin:0">${svg.replace('width="64" height="64"', 'width="48" height="48"')}</body>`);
const png = await page.screenshot({ omitBackground: true });
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // image count
header.writeUInt8(48, 6); // width
header.writeUInt8(48, 7); // height
header.writeUInt16LE(1, 10); // colour planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18); // image data offset
writeFileSync(resolve(root, 'app/favicon.ico'), Buffer.concat([header, png]));
console.log('wrote favicon.ico');

await browser.close();
