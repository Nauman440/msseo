import { cdnOf } from './rules-site';
import { plural, type RuleDef } from './types';

/** Lighthouse 13 insight rules on the homepage, mobile (spec §6.2 1.8.3, 1.8.5, 1.8.7, 1.8.8; §6.3 2.5.3). */

const kb = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const BUILDERS = ['elementor', 'divi', 'wpbakery'];

export const assetRules: RuleDef[] = [
  {
    id: '1.8.3', module: 1, category: 'speed', card: 'speed', scope: 'page', severity: 'medium',
    title: { client: 'Images are heavier than they need to be', expert: 'Image size, format and compression' },
    explain: { client: 'Large photos are the most common reason pages load slowly on phones.', expert: 'Lighthouse image-delivery savings: compression, modern formats (WebP/AVIF), images > 200 KB.' },
    fix: { client: 'Compress photos and save them as WebP before uploading.', expert: 'Serve WebP/AVIF, compress, and cap hero images at ~200 KB.' },
    ice: { impact: 3, confidence: 4, effort: 2 },
    evaluate: ({ data }) => {
      const imgs = data.psi?.insights?.images;
      if (!imgs) return null;
      const wasted = imgs.reduce((s, i) => s + i.wastedBytes, 0);
      const heavy = imgs.filter((i) => i.totalBytes > 200 * 1024 || i.format);
      if (wasted <= 100 * 1024 && !heavy.length) return { status: 'pass', message: { client: 'Images are well optimised', expert: `Image delivery savings ${kb(wasted)}` } };
      return {
        status: wasted > 1_048_576 ? 'fail' : 'warn',
        affected: imgs.map((i) => i.url),
        applicable: imgs.length,
        metrics: { wastedBytes: wasted },
        message: { client: `Images on the homepage could be ${kb(wasted)} smaller`, expert: `Image delivery savings ${kb(wasted)}; ${heavy.length} images > 200 KB or not WebP/AVIF` },
      };
    },
  },
  {
    id: '1.8.5', module: 1, category: 'speed', card: 'speed', scope: 'site', severity: 'medium',
    title: { client: 'The site loads code it does not use', expert: 'Unused JS/CSS, heavy plugins and builders' },
    explain: { client: 'Plugins and page builders often load code that every visitor downloads but never needs.', expert: 'unused-javascript + unused-css-rules savings; page builders add heavy CSS/JS.' },
    fix: { client: 'Remove plugins you do not use and ask your developer to load scripts only where needed.', expert: 'Remove unused plugins, code-split, and dequeue assets per template.' },
    ice: { impact: 3, confidence: 3, effort: 3 },
    evaluate: ({ data, home }) => {
      const ins = data.psi?.insights;
      if (!ins || (ins.unusedJsBytes === null && ins.unusedCssBytes === null)) return null;
      const js = ins.unusedJsBytes ?? 0;
      const css = ins.unusedCssBytes ?? 0;
      const ms = ins.unusedMs ?? 0;
      const builder = home?.hints.find((h) => BUILDERS.includes(h));
      const metrics = { unusedJsBytes: js, unusedCssBytes: css, savingsMs: ms, ...(builder ? { builder } : {}) };
      const extra = builder ? ` (built with ${builder})` : '';
      if (js + css <= 150 * 1024 && ms <= 300) return { status: 'pass', metrics, message: { client: 'Little unused code', expert: `Unused JS+CSS ${kb(js + css)}` } };
      return {
        status: 'warn',
        affected: [data.preflight.homepage.finalUrl],
        applicable: 1,
        metrics,
        message: { client: `The homepage loads ${kb(js + css)} of unused code${extra}`, expert: `Unused JS ${kb(js)}, CSS ${kb(css)}; est. ${Math.round(ms)} ms LCP saving${extra}` },
      };
    },
  },
  {
    id: '1.8.7', module: 1, category: 'speed', card: 'speed', scope: 'site', severity: 'low',
    title: { client: 'Files are not cached, compressed or served from a CDN', expert: 'Caching, compression, CDN' },
    explain: { client: 'Returning visitors re-download files, and text files travel uncompressed.', expert: 'cache-insight wasted bytes, text compression, CDN header.' },
    fix: { client: 'Turn on browser caching and compression, and put the site behind a CDN such as Cloudflare.', expert: 'Long Cache-Control for static assets, gzip/brotli, and a CDN.' },
    ice: { impact: 2, confidence: 4, effort: 2 },
    evaluate: ({ data }) => {
      const ins = data.psi?.insights;
      const cdn = cdnOf(data.preflight.homepage.headers);
      const issues: string[] = [];
      if (ins?.cacheWastedBytes && ins.cacheWastedBytes > 100 * 1024) issues.push(`short cache lifetimes (${kb(ins.cacheWastedBytes)})`);
      if (ins?.compression === false) issues.push('no text compression');
      if (!cdn) issues.push('no CDN detected');
      const metrics = { cdn: cdn ?? 'none' };
      if (!issues.length) return { status: 'pass', metrics, message: { client: 'Caching, compression and CDN are in place', expert: `Cache OK, compressed, CDN ${cdn}` } };
      return { status: 'warn', affected: [data.preflight.homepage.finalUrl], applicable: 1, metrics, message: { client: `Found: ${issues.join(', ')}`, expert: `Issues: ${issues.join('; ')}` } };
    },
  },
  {
    id: '1.8.8', module: 1, category: 'speed', card: 'speed', scope: 'site', severity: 'low',
    title: { client: 'Fonts and outside scripts slow the page', expert: 'Font display and third-party scripts' },
    explain: { client: 'Web fonts can hide text while loading, and chat, tracking and ad scripts take time on phones.', expert: 'font-display-insight delay; third-party main-thread time > 250 ms.' },
    fix: { client: 'Ask your developer to load fonts with "swap" and remove scripts you do not need.', expert: 'font-display: swap; defer/remove heavy third parties.' },
    ice: { impact: 2, confidence: 3, effort: 2 },
    evaluate: ({ data }) => {
      const ins = data.psi?.insights;
      if (!ins || (ins.fontDisplayMs === null && ins.thirdParties === null)) return null;
      const third = (ins.thirdParties ?? []).reduce((s, t) => s + t.mainThreadMs, 0);
      const top = (ins.thirdParties ?? []).slice(0, 3).map((t) => `${t.entity} ${t.mainThreadMs} ms`).join(', ');
      const issues: string[] = [];
      if ((ins.fontDisplayMs ?? 0) > 0) issues.push(`fonts delay text by ${Math.round(ins.fontDisplayMs ?? 0)} ms`);
      if (third > 250) issues.push(`outside scripts use ${Math.round(third)} ms`);
      if (!issues.length) return { status: 'pass', message: { client: 'Fonts and outside scripts are light', expert: `Third-party main thread ${Math.round(third)} ms; no font-display delay` } };
      return {
        status: 'warn',
        affected: [data.preflight.homepage.finalUrl],
        applicable: 1,
        metrics: { fontDelayMs: Math.round(ins.fontDisplayMs ?? 0), thirdPartyMs: Math.round(third) },
        message: { client: issues.join('; '), expert: `${issues.join('; ')}${top ? ` (top: ${top})` : ''}` },
      };
    },
  },
  {
    id: '2.5.3', module: 2, category: 'onpage', card: 'images', scope: 'page', severity: 'medium',
    title: { client: 'Images are bigger than shown or have no set size', expert: 'Oversized or unsized images' },
    explain: { client: 'Images larger than their display size waste data, and images without a set size make the page jump while loading.', expert: 'Intrinsic size > displayed size (responsive images) and <img> without width/height (CLS).' },
    fix: { client: 'Resize images to the size they are shown at, and give each one a width and height.', expert: 'Use srcset/sizes; set width/height attributes.' },
    ice: { impact: 2, confidence: 4, effort: 2 },
    evaluate: ({ data }) => {
      const ins = data.psi?.insights;
      if (!ins || (ins.images === null && ins.unsizedImages === null)) return null;
      const oversized = (ins.images ?? []).filter((i) => i.oversized);
      const unsized = ins.unsizedImages ?? 0;
      if (!oversized.length && !unsized) return { status: 'pass', message: { client: 'Images are sized correctly', expert: 'No oversized or unsized images' } };
      const parts = [oversized.length ? `${plural(oversized.length, 'image')} bigger than shown` : '', unsized ? `${plural(unsized, 'image')} without a set size` : ''].filter(Boolean);
      return {
        status: 'warn',
        affected: oversized.map((i) => i.url),
        metrics: { oversized: oversized.length, unsized },
        message: { client: parts.join(', '), expert: `${oversized.length} oversized, ${unsized} unsized images on the homepage` },
      };
    },
  },
];
