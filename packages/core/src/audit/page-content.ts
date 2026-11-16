import { parse, type HTMLElement } from 'node-html-parser';
import { request, type HttpLog } from '../providers/http';

/**
 * What the content, trust and AI-readiness rules need from each audited page, read
 * from its HTML by us (free, in parallel with DataForSEO). Main text excludes nav,
 * header and footer so site-wide boilerplate does not count as page content.
 */
export type PageContent = {
  url: string;
  status: number;
  lang?: string;
  viewport: boolean;
  generator?: string;
  /** <meta name="robots"> content, lowercased. */
  robots?: string;
  /** Absolute rel=canonical URL. */
  canonical?: string;
  title?: string;
  description?: string;
  h1: string[];
  headings: { level: number; text: string }[];
  /** Main content text (main/article, else body without nav/header/footer). */
  text: string;
  words: number;
  /** First substantial paragraph after the first H1 (the "direct answer" slot). */
  firstParagraph?: string;
  links: { href: string; text: string; internal: boolean; imageAlt?: string; inNav: boolean }[];
  images: { src: string; alt?: string }[];
  jsonLd: Record<string, unknown>[];
  schemaTypes: string[];
  hreflang: { lang: string; href: string }[];
  videos: number;
  forms: { fields: number }[];
  telLinks: number;
  lists: number;
  tables: number;
  faqMarkup: boolean;
  breadcrumbMarkup: boolean;
  /** Whole-page text incl. header/footer (for phone, address, licence and review signals). */
  fullText: string;
  /** Raw signals for CMS / page builder / JS framework detection. */
  hints: string[];
};

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
export const wordCount = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

const HINTS: [string, RegExp][] = [
  ['wordpress', /wp-content|wp-includes/i],
  ['elementor', /elementor/i],
  ['divi', /et_pb_|\/themes\/Divi\//i],
  ['wpbakery', /vc_row|wpb_/i],
  ['shopify', /cdn\.shopify\.com|Shopify\.theme/i],
  ['wix', /static\.wixstatic\.com|wix\.com/i],
  ['squarespace', /squarespace/i],
  ['webflow', /webflow/i],
  ['nextjs', /__NEXT_DATA__|\/_next\/static/],
  ['react', /data-reactroot|react-dom/i],
  ['vue', /data-v-[0-9a-f]{6}|__vue__/i],
  ['nuxt', /__NUXT__|\/_nuxt\//],
  ['angular', /ng-version=/],
  ['gatsby', /___gatsby/],
];

function flattenJsonLd(value: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(value)) value.forEach((v) => flattenJsonLd(v, out));
  else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj['@graph'])) flattenJsonLd(obj['@graph'], out);
    if (obj['@type']) out.push(obj);
  }
}

const absolute = (href: string | undefined, base: string) => {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
};

export function parsePageContent(html: string, url: string, status = 200): PageContent {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: false, pre: true } });
  const host = new URL(url).hostname.replace(/^www\./, '');

  const jsonLd: Record<string, unknown>[] = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      flattenJsonLd(JSON.parse(s.text), jsonLd);
    } catch {
      // invalid JSON-LD is reported by rule 1.11.2 (DataForSEO validation)
    }
  }
  const schemaTypes = [...new Set(jsonLd.flatMap((o) => (Array.isArray(o['@type']) ? o['@type'] : [o['@type']]).map(String)))];

  const links = root.querySelectorAll('a[href]').flatMap((a) => {
    const raw = a.getAttribute('href') ?? '';
    if (/^(mailto:|tel:|javascript:|#)/i.test(raw)) return [];
    try {
      const u = new URL(raw, url);
      if (!/^https?:$/.test(u.protocol)) return [];
      u.hash = '';
      const inNav = Boolean(a.closest('nav, header, footer'));
      const img = a.querySelector('img');
      return [{ href: u.toString(), text: clean(a.text), internal: u.hostname.replace(/^www\./, '') === host, imageAlt: img ? clean(img.getAttribute('alt')) : undefined, inNav }];
    } catch {
      return [];
    }
  });

  const fullText = clean(root.querySelector('body')?.text ?? root.text);
  // Main content: <main>/<article> when present, otherwise the body minus boilerplate.
  const body = (root.querySelector('main') ?? root.querySelector('article') ?? root.querySelector('body') ?? root) as HTMLElement;
  const main = parse(body.toString());
  main.querySelectorAll('script, style, noscript, svg, nav, header, footer, form, iframe').forEach((n) => n.remove());
  const text = clean(main.text);

  const h1Node = root.querySelector('h1');
  let firstParagraph: string | undefined;
  if (h1Node) {
    const all = root.querySelectorAll('h1, p');
    const start = all.indexOf(h1Node);
    firstParagraph = all.slice(start + 1).find((n) => n.tagName === 'P' && wordCount(n.text) >= 8)?.text;
  }

  return {
    url,
    status,
    lang: root.querySelector('html')?.getAttribute('lang') ?? undefined,
    viewport: Boolean(root.querySelector('meta[name="viewport"]')),
    generator: root.querySelector('meta[name="generator"]')?.getAttribute('content') ?? undefined,
    robots: root.querySelector('meta[name="robots"]')?.getAttribute('content')?.toLowerCase() ?? undefined,
    canonical: absolute(root.querySelector('link[rel="canonical"]')?.getAttribute('href'), url),
    title: clean(root.querySelector('title')?.text) || undefined,
    description: root.querySelector('meta[name="description"]')?.getAttribute('content') ?? undefined,
    h1: root.querySelectorAll('h1').map((h) => clean(h.text)).filter(Boolean),
    headings: root.querySelectorAll('h1, h2, h3, h4, h5, h6').map((h) => ({ level: Number(h.tagName[1]), text: clean(h.text) })).filter((h) => h.text),
    text,
    words: wordCount(text),
    firstParagraph: firstParagraph ? clean(firstParagraph) : undefined,
    links,
    images: root.querySelectorAll('img').map((i) => ({ src: i.getAttribute('src') ?? i.getAttribute('data-src') ?? '', alt: i.getAttribute('alt') ?? undefined })).filter((i) => i.src),
    jsonLd,
    schemaTypes,
    hreflang: root.querySelectorAll('link[rel="alternate"][hreflang]').map((l) => ({ lang: l.getAttribute('hreflang') ?? '', href: l.getAttribute('href') ?? '' })),
    videos: root.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"], iframe[src*="wistia"]').length,
    forms: root.querySelectorAll('form').map((f) => ({ fields: f.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').length })),
    telLinks: root.querySelectorAll('a[href^="tel:"]').length,
    lists: main.querySelectorAll('ul, ol').length,
    tables: main.querySelectorAll('table').length,
    faqMarkup: Boolean(root.querySelector('details summary, [class*="faq" i], [id*="faq" i]')) || /\b(faq|frequently asked)/i.test(root.querySelectorAll('h2, h3').map((h) => h.text).join(' ')),
    breadcrumbMarkup: Boolean(root.querySelector('[aria-label*="breadcrumb" i], [class*="breadcrumb" i], [id*="breadcrumb" i]')),
    fullText,
    hints: HINTS.filter(([, re]) => re.test(html)).map(([name]) => name),
  };
}

/** Fetches and parses up to `urls.length` pages, 6 at a time; failed pages are skipped. */
export async function fetchPageContents(urls: string[], log?: HttpLog): Promise<PageContent[]> {
  const out: PageContent[] = [];
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        try {
          const res = await request(url, { provider: 'site', headers: { 'user-agent': BROWSER_UA, accept: 'text/html' }, timeoutMs: 8_000, retries: 0, log });
          if (!/text\/html|application\/xhtml/i.test(res.headers.get('content-type') ?? '')) {
            await res.body?.cancel();
            continue;
          }
          const html = (await res.text()).slice(0, 1_500_000);
          out.push(parsePageContent(html, res.url || url, res.status));
        } catch {
          // unreachable page: DataForSEO's result for it still counts
        }
      }
    }),
  );
  return out;
}
