import { request, type HttpLog } from './http';

/** Pipeline step 1–2 (§5.3): checks made directly against the site, no paid API. */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

export type RobotsInfo = {
  found: boolean;
  status: number;
  body: string;
  sitemaps: string[];
  /** Disallow rules that apply to all bots (User-agent: *). */
  disallowAll: string[];
};

export type SitemapInfo = {
  url: string;
  status: number;
  valid: boolean;
  isIndex: boolean;
  urls: string[];
};

export type UrlCheck = { url: string; status: number; location?: string };

export type Preflight = {
  origin: string;
  homepage: {
    url: string;
    status: number;
    finalUrl: string;
    headers: Record<string, string>;
    /** Combined robots directives from <meta name="robots|googlebot"> and X-Robots-Tag, lowercased. */
    robotsDirectives: string[];
  };
  variants: { url: string; status: number; location?: string }[];
  robots: RobotsInfo;
  sitemaps: SitemapInfo[];
  sitemapUrlChecks: UrlCheck[];
  sitemapUrlTotal: number;
  botAccess: { ua: 'browser' | 'googlebot'; status: number }[];
};

type Opts = { log?: HttpLog; maxSitemapUrlChecks?: number };

const get = (url: string, opts: Opts, extra: { ua?: string; manual?: boolean; method?: 'GET' | 'HEAD' } = {}) =>
  request(url, {
    provider: 'site',
    method: extra.method ?? 'GET',
    headers: { 'user-agent': extra.ua ?? BROWSER_UA },
    manualRedirect: extra.manual,
    timeoutMs: 15_000,
    retries: 1,
    log: opts.log,
  });

export function parseRobots(body: string): Pick<RobotsInfo, 'sitemaps' | 'disallowAll'> {
  const sitemaps: string[] = [];
  const disallowAll: string[] = [];
  let groupAgents: string[] = [];
  let inRules = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
    } else if (key === 'user-agent') {
      if (inRules) groupAgents = [];
      inRules = false;
      groupAgents.push(value.toLowerCase());
    } else if (key === 'disallow' || key === 'allow') {
      inRules = true;
      if (key === 'disallow' && value && groupAgents.includes('*')) disallowAll.push(value);
    }
  }
  return { sitemaps, disallowAll };
}

/** Directives from <meta name="robots"/"googlebot"> tags and the X-Robots-Tag header. */
export function parseRobotsDirectives(html: string, header?: string): string[] {
  const out = new Set<string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/\bname\s*=\s*["']?(robots|googlebot)["']?/i.test(tag)) continue;
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    for (const d of content.split(',')) if (d.trim()) out.add(d.trim().toLowerCase());
  }
  for (const d of (header ?? '').split(',')) {
    // X-Robots-Tag may be prefixed with a bot name: "googlebot: noindex".
    const v = d.split(':').pop()?.trim().toLowerCase();
    if (v) out.add(v);
  }
  return [...out];
}

const LOC =/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi;

export function parseSitemap(xml: string): { isIndex: boolean; urls: string[]; valid: boolean } {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const valid = isIndex || /<urlset[\s>]/i.test(xml);
  const urls = [...xml.matchAll(LOC)].map((m) => m[1]!.replace(/&amp;/g, '&'));
  return { isIndex, urls, valid };
}

/** Sitemaps from robots.txt first; the conventional paths only when none of those is valid. */
async function fetchSitemaps(fromRobots: string[], origin: string, opts: Opts): Promise<SitemapInfo[]> {
  const out: SitemapInfo[] = [];
  const seen = new Set<string>();

  const visit = async (url: string, depth: number): Promise<void> => {
    if (seen.has(url) || seen.size >= 12) return;
    seen.add(url);
    try {
      const res = await get(url, opts);
      const parsed = parseSitemap(res.ok ? await res.text() : '');
      out.push({ url, status: res.status, valid: res.ok && parsed.valid, isIndex: parsed.isIndex, urls: parsed.isIndex ? [] : parsed.urls });
      if (parsed.isIndex && depth === 0) for (const child of parsed.urls.slice(0, 10)) await visit(child, 1);
    } catch {
      out.push({ url, status: 0, valid: false, isIndex: false, urls: [] });
    }
  };

  for (const url of fromRobots) await visit(url, 0);
  if (!out.some((s) => s.valid)) {
    for (const url of [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]) {
      await visit(url, 0);
      if (out.some((s) => s.valid)) break;
    }
  }
  return out;
}

async function checkUrls(urls: string[], opts: Opts): Promise<UrlCheck[]> {
  const results: UrlCheck[] = [];
  const batch = 10;
  for (let i = 0; i < urls.length; i += batch) {
    const slice = urls.slice(i, i + batch);
    results.push(
      ...(await Promise.all(
        slice.map(async (url) => {
          try {
            const res = await get(url, opts, { manual: true, method: 'HEAD' });
            return { url, status: res.status, location: res.headers.get('location') ?? undefined };
          } catch {
            return { url, status: 0 };
          }
        }),
      )),
    );
  }
  return results;
}

export async function runPreflight(inputUrl: string, opts: Opts = {}): Promise<Preflight> {
  const start = new URL(inputUrl);
  const bare = start.hostname.replace(/^www\./, '');

  const home = await get(start.toString(), opts);
  const finalUrl = home.url || start.toString();
  const origin = new URL(finalUrl).origin;
  const headers: Record<string, string> = {};
  home.headers.forEach((v, k) => (headers[k] = v));
  const html = home.ok ? (await home.text()).slice(0, 500_000) : '';
  if (!home.ok) await home.body?.cancel();
  const robotsDirectives = parseRobotsDirectives(html, headers['x-robots-tag']);

  const variantsP = Promise.all(
    [`http://${bare}/`, `http://www.${bare}/`, `https://${bare}/`, `https://www.${bare}/`].map(async (url) => {
      try {
        const res = await get(url, opts, { manual: true, method: 'HEAD' });
        return { url, status: res.status, location: res.headers.get('location') ?? undefined };
      } catch {
        return { url, status: 0 };
      }
    }),
  );

  const botAccessP = Promise.all(
    (['browser', 'googlebot'] as const).map(async (ua) => {
      try {
        const res = await get(origin + '/', opts, { ua: ua === 'googlebot' ? GOOGLEBOT_UA : BROWSER_UA, method: 'HEAD' });
        return { ua, status: res.status };
      } catch {
        return { ua, status: 0 };
      }
    }),
  );

  let robots: RobotsInfo = { found: false, status: 0, body: '', sitemaps: [], disallowAll: [] };
  try {
    const res = await get(`${origin}/robots.txt`, opts);
    const body = res.ok ? (await res.text()).slice(0, 50_000) : '';
    robots = { found: res.ok && body.length > 0, status: res.status, body, ...parseRobots(body) };
  } catch {
    // unreachable robots.txt stays "not found"
  }

  const sitemaps = await fetchSitemaps(robots.sitemaps, origin, opts);
  const allUrls = [...new Set(sitemaps.flatMap((s) => s.urls))];
  const sitemapUrlChecks = await checkUrls(allUrls.slice(0, opts.maxSitemapUrlChecks ?? 30), opts);
  const [variants, botAccess] = await Promise.all([variantsP, botAccessP]);

  return {
    origin,
    homepage: { url: start.toString(), status: home.status, finalUrl, headers, robotsDirectives },
    variants,
    robots,
    sitemaps,
    sitemapUrlChecks,
    sitemapUrlTotal: allUrls.length,
    botAccess,
  };
}
