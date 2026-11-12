// Builds every brand asset from the master logo (public/brand/morosoft-logo.webp,
// white text + green, made for dark backgrounds):
//   public/brand/morosoft-logo-dark.webp  — same logo with dark text, for light surfaces
//   public/brand/morosoft-symbol.png      — ring + rocket mark only (no wordmark)
//   public/icons/*.png, app/favicon.ico   — PWA / browser icons from the symbol
// Run: pnpm --filter @seo/web icons   (re-run whenever the logo changes)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = resolve(root, 'public/brand');
const iconDir = resolve(root, 'public/icons');
mkdirSync(iconDir, { recursive: true });

const NIGHT = '#110D0B';
const INK = [24, 18, 14]; // tailwind ink #18120E
const logoSrc = `data:image/webp;base64,${readFileSync(resolve(brandDir, 'morosoft-logo.webp')).toString('base64')}`;

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent('<body style="margin:0"></body>');

/** Runs canvas work in the browser and returns { name: base64 } images. */
const derived = await page.evaluate(
  async ({ src, ink }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const { naturalWidth: w, naturalHeight: h } = img;
    const canvas = (cw, ch) => Object.assign(document.createElement('canvas'), { width: cw, height: ch });
    const base = canvas(w, h).getContext('2d');
    base.drawImage(img, 0, 0);
    const pixels = base.getImageData(0, 0, w, h);
    const d = pixels.data;

    const isWhite = (i) =>
      Math.min(d[i], d[i + 1], d[i + 2]) > 170 && Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) < 40;

    // The "moro" pill: on each row, white pixels with green on both sides (within the row) sit inside it.
    const insidePill = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const greens = [];
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] > 200 && d[i + 1] > d[i] + 60 && d[i + 1] > d[i + 2] + 10) greens.push(x);
      }
      if (greens.length < 2) continue;
      // Pill spans are long green runs; text gaps inside them are short. Only fill gaps ≤ 60px.
      for (let k = 0; k < greens.length - 1; k++) {
        const a = greens[k];
        const b = greens[k + 1];
        if (b - a > 1 && b - a <= 60 && a >= 140) for (let x = a; x <= b; x++) insidePill[y * w + x] = 1;
      }
    }

    // 1. Dark variant: white pixels outside the pill → ink. Alpha is kept, so edges stay smooth.
    const dark = new ImageData(new Uint8ClampedArray(d), w, h);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      if (insidePill[p] || !isWhite(i)) continue;
      dark.data[i] = ink[0];
      dark.data[i + 1] = ink[1];
      dark.data[i + 2] = ink[2];
    }
    const darkCanvas = canvas(w, h);
    darkCanvas.getContext('2d').putImageData(dark, 0, 0);

    // 2. Symbol: connected shapes that start left of the wordmark (ring + rocket pieces).
    const label = new Int32Array(w * h).fill(-1);
    const keep = new Uint8Array(w * h);
    let next = 0;
    let box = { x0: w, y0: h, x1: 0, y1: 0 };
    for (let start = 0; start < w * h; start++) {
      if (label[start] !== -1 || d[start * 4 + 3] < 24) continue;
      const stack = [start];
      const members = [];
      let minX = w;
      label[start] = next;
      while (stack.length) {
        const p = stack.pop();
        members.push(p);
        const x = p % w;
        const y = (p - x) / w;
        minX = Math.min(minX, x);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (label[q] === -1 && d[q * 4 + 3] >= 24) {
            label[q] = next;
            stack.push(q);
          }
        }
      }
      next++;
      if (minX >= 140) continue; // wordmark starts at the "moro" pill (~x 150)
      for (const p of members) {
        keep[p] = 1;
        const x = p % w;
        const y = (p - x) / w;
        box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
      }
    }
    // Include soft anti-aliased edge pixels next to kept shapes.
    const sym = new ImageData(w, h);
    for (let p = 0; p < w * h; p++) {
      const x = p % w;
      const y = (p - x) / w;
      let near = keep[p];
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = keep[(y + dy) * w + (x + dx)] || 0;
      if (near && x < box.x1 + 2) for (let k = 0; k < 4; k++) sym.data[p * 4 + k] = d[p * 4 + k];
    }
    const pad = 2;
    const sw = box.x1 - box.x0 + 1 + pad * 2;
    const sh = box.y1 - box.y0 + 1 + pad * 2;
    const symCanvas = canvas(sw, sh);
    symCanvas.getContext('2d').putImageData(sym, -box.x0 + pad, -box.y0 + pad);

    const b64 = (c, type, q) => c.toDataURL(type, q).split(',')[1];
    return {
      dark: b64(darkCanvas, 'image/webp', 0.95),
      symbol: b64(symCanvas, 'image/png'),
      symbolSize: [sw, sh],
    };
  },
  { src: logoSrc, ink: INK },
);

writeFileSync(resolve(brandDir, 'morosoft-logo-dark.webp'), Buffer.from(derived.dark, 'base64'));
writeFileSync(resolve(brandDir, 'morosoft-symbol.png'), Buffer.from(derived.symbol, 'base64'));
console.log('wrote brand/morosoft-logo-dark.webp, brand/morosoft-symbol.png', derived.symbolSize.join('×'));

const symbolSrc = `data:image/png;base64,${derived.symbol}`;

/** Symbol centred on a night tile. `scale` = share of the tile the symbol fills; `radius` in % of size. */
async function renderIcon(size, { scale, radius, transparent = false }) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;width:${size}px;height:${size}px;background:transparent">
      <div style="width:100%;height:100%;display:grid;place-items:center;background:${NIGHT};border-radius:${radius}%">
        <img src="${symbolSrc}" style="width:${Math.round(size * scale)}px;height:${Math.round(size * scale)}px;object-fit:contain">
      </div></body>`,
  );
  await page.evaluate(() => document.images[0].decode());
  return page.screenshot({ omitBackground: transparent });
}

const targets = [
  { file: 'icon-192.png', size: 192, scale: 0.74, radius: 22, transparent: true },
  { file: 'icon-512.png', size: 512, scale: 0.74, radius: 22, transparent: true },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.7, radius: 0 },
  // Maskable: full bleed, mark inside the 80% safe zone.
  { file: 'maskable-512.png', size: 512, scale: 0.56, radius: 0 },
];
for (const t of targets) {
  writeFileSync(resolve(iconDir, t.file), await renderIcon(t.size, t));
  console.log('wrote icons/' + t.file);
}

// favicon.ico: one 48px PNG in an ICO container; also app/icon.png for <link rel="icon">.
const fav = await renderIcon(48, { scale: 0.86, radius: 22, transparent: true });
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(48, 6);
header.writeUInt8(48, 7);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(fav.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync(resolve(root, 'app/favicon.ico'), Buffer.concat([header, fav]));
writeFileSync(resolve(root, 'app/icon.png'), await renderIcon(192, { scale: 0.8, radius: 22, transparent: true }));
console.log('wrote app/favicon.ico, app/icon.png');

await browser.close();
