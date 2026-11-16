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

/** What the audit needs to start checking pages, known a few seconds into preflight. */
export type Discovery = {
  homepage: { status: number; finalUrl: string };
  /** Same-site page URLs: homepage links first (navigation), then sitemap URLs. */
  candidates: string[];
};

type Opts = {
  log?: HttpLog;
  maxSitemapUrlChecks?: number;
  /** Called once the homepage, robots.txt and sitemaps are read, before the slower checks finish. */
  onDiscovery?: (d: Discovery) => void;
};

// Short timeouts, no retries for side checks: a slow site must not hold the audit up
// (a 15 s timeout with one retry cost up to 30 s per request before 2026-11-16).
const get = (url: string, opts: Opts, extra: { ua?: string; manual?: boolean; method?: 'GET' | 'HEAD'; retries?: number } = {}) =>
  request(url, {
    provider: 'site',
    method: extra.method ?? 'GET',
    headers: { 'user-agent': extra.ua ?? BROWSER_UA },
    manualRedirect: extra.manual,
    timeoutMs: 8_000,
    retries: extra.retries ?? 0,
    log: opts.log,
  });

const NON_PAGE = /\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|mp4|mp3|css|js|xml|txt|docx?|xlsx?)$/i;

/** Internal page links from the homepage HTML, in document order. */
export function internalLinks(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const host = base.hostname.replace(/^www\./, '');
  const out = new Set<string>();
  // Whole href (fragments are stripped below); pure "#section" links resolve to the page itself.
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1]!.replace(/&amp;/g, '&'), base);
      if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, '') !== host) continue;
      if (NON_PAGE.test(u.pathname) || /\/(wp-admin|wp-login|cart|checkout|my-account|feed)\b/i.test(u.pathname)) continue;
      u.hash = '';
      out.add(u.toString());
    } catch {
      // ignore malformed hrefs
    }
  }
  return [...out];
}

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
      if (parsed.isIndex && depth === 0) await Promise.all(parsed.urls.slice(0, 10).map((child) => visit(child, 1)));
    } catch {
      out.push({ url, status: 0, valid: false, isIndex: false, urls: [] });
    }
  };

  await Promise.all(fromRobots.map((url) => visit(url, 0)));
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
  const batch = 15;
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

  const home = await get(start.toString(), opts, { retries: 1 });
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
  opts.onDiscovery?.({
    homepage: { status: home.status, finalUrl },
    candidates: [...new Set([finalUrl, ...internalLinks(html, finalUrl), ...allUrls.filter((u) => !NON_PAGE.test(new URL(u, origin).pathname))])],
  });
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
