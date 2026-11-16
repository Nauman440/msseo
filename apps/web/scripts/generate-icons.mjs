// Builds every brand asset from the MS SCORE masters in <repo>/logo/:
//   logo-black.png  horizontal logo, dark text (for light surfaces)
//   favicon.png     the MS symbol alone (500×500, transparent)
// Outputs:
//   public/brand/msscore-logo.png        horizontal logo, dark text
//   public/brand/msscore-logo-light.png  same with light text, for navy surfaces
//   public/brand/msscore-mark.png        symbol only
//   public/icons/*.png, app/favicon.ico, app/icon.png  PWA / browser icons
// Run: pnpm --filter @seo/web icons   (re-run whenever the masters change)
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const masters = resolve(root, '../../logo');
const brandDir = resolve(root, 'public/brand');
const iconDir = resolve(root, 'public/icons');
mkdirSync(brandDir, { recursive: true });
mkdirSync(iconDir, { recursive: true });

const MIST = [250, 247, 242]; // tailwind mist #FAF7F2: light text on navy
const dataUrl = (file) => `data:image/png;base64,${readFileSync(resolve(masters, file)).toString('base64')}`;

copyFileSync(resolve(masters, 'logo-black.png'), resolve(brandDir, 'msscore-logo.png'));
copyFileSync(resolve(masters, 'favicon.png'), resolve(brandDir, 'msscore-mark.png'));

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const page = await browser.newPage();
await page.setContent('<body style="margin:0"></body>');

// Light variant: near-black, unsaturated pixels (the "S", "SCORE", the byline) become
// mist; the orange stays. Alpha is untouched, so anti-aliased edges stay smooth.
const light = await page.evaluate(
  async ({ src, mist }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight });
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height);
    const d = px.data;
    for (let i = 0; i < d.length; i += 4) {
      const max = Math.max(d[i], d[i + 1], d[i + 2]);
      const min = Math.min(d[i], d[i + 1], d[i + 2]);
      if (d[i + 3] > 0 && max < 120 && max - min < 40) [d[i], d[i + 1], d[i + 2]] = mist;
    }
    ctx.putImageData(px, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  },
  { src: dataUrl('logo-black.png'), mist: MIST },
);
writeFileSync(resolve(brandDir, 'msscore-logo-light.png'), Buffer.from(light, 'base64'));
console.log('wrote brand/msscore-logo.png, msscore-logo-light.png, msscore-mark.png');

/** Symbol centred on a square canvas; `bg` null keeps it transparent. */
async function renderIcon(size, { scale, bg = null }) {
  const b64 = await page.evaluate(
    async ({ src, size, scale, bg }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
      const ctx = c.getContext('2d');
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);
      }
      const s = size * scale;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (size - s) / 2, (size - s) / 2, s, s);
      return c.toDataURL('image/png').split(',')[1];
    },
    { src: dataUrl('favicon.png'), size, scale, bg },
  );
  return Buffer.from(b64, 'base64');
}

// The master already has padding around the symbol, so transparent icons use it as is;
// opaque icons (iOS, Android maskable) need a white plate and a safe-zone margin.
const targets = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.9, bg: '#FFFFFF' },
  { file: 'maskable-512.png', size: 512, scale: 0.72, bg: '#FFFFFF' },
];
for (const t of targets) {
  writeFileSync(resolve(iconDir, t.file), await renderIcon(t.size, t));
  console.log('wrote icons/' + t.file);
}

// favicon.ico: one 48px PNG in an ICO container; app/icon.png for <link rel="icon">.
const fav = await renderIcon(48, { scale: 1.12 });
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image
header.writeUInt8(48, 6); // width
header.writeUInt8(48, 7); // height
header.writeUInt16LE(1, 10); // colour planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(fav.length, 14); // image size
header.writeUInt32LE(22, 18); // offset of image data
writeFileSync(resolve(root, 'app/favicon.ico'), Buffer.concat([header, fav]));
writeFileSync(resolve(root, 'app/icon.png'), await renderIcon(192, { scale: 1.12 }));
console.log('wrote app/favicon.ico, app/icon.png');

await browser.close();
