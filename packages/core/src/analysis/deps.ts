import { fetchPageContents } from '../audit/page-content';
import type { AuditEnv } from '../audit/run';
import { createAnalysisClient } from '../providers/dataforseo-analysis';
import { createCompetitorClient, type Locale } from '../providers/dataforseo-competitors';
import { parseSitemap } from '../providers/direct-fetch';
import { request, type HttpLog } from '../providers/http';
import { createOpenAiClient } from '../providers/openai';
import { runPageSpeed } from '../providers/pagespeed';
import type { AnalysisDeps } from './analysis';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

async function text(url: string, log?: HttpLog): Promise<string | null> {
  try {
    const res = await request(url, { provider: 'site', headers: { 'user-agent': UA }, timeoutMs: 10_000, retries: 0, log });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    return (await res.text()).slice(0, 5_000_000);
  } catch {
    return null;
  }
}

/** Pages listed in a site's sitemap (index: up to 10 child sitemaps), or null when there is none. */
export async function sitemapCount(domain: string, log?: HttpLog): Promise<number | null> {
  for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml']) {
    const xml = await text(`https://${domain}${path}`, log);
    if (!xml) continue;
    const map = parseSitemap(xml);
    if (!map.valid) continue;
    if (!map.isIndex) return map.urls.length;
    const children = await Promise.all(map.urls.slice(0, 10).map((u) => text(u, log)));
    return children.reduce((sum, x) => sum + (x ? parseSitemap(x).urls.length : 0), 0);
  }
  return null;
}

/** The real services for a run: DataForSEO, PageSpeed (free, short timeout), page fetches and OpenAI. */
export function analysisDeps(env: AuditEnv, locale: Locale, log?: HttpLog): AnalysisDeps {
  const dfs = { ...env.dataforseo, log };
  const competitors = createCompetitorClient(dfs);
  const key = env.pagespeedKey;
  return {
    dfs: createAnalysisClient(dfs),
    rank: (d) => competitors.rankOverview(d, locale),
    pages: (urls) => fetchPageContents(urls, log),
    speed: key ? async (url) => (await runPageSpeed(url, 'mobile', key, log, { timeoutMs: 60_000, retries: 0 })).performance : undefined,
    sitemapCount: (d) => sitemapCount(d, log),
    ai: env.openai ? createOpenAiClient({ ...env.openai, log }) : null,
  };
}
