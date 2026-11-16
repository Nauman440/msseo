import { expectedCtr } from '../scoring/ctr-curve';
import type { PageContent } from './page-content';
import { INDEXED_JUNK } from './rules-urls';
import { countPages, pathOf, plural, type AuditContext, type RuleDef } from './types';

/** Search Console rules (spec §6.2/§6.3: 1.3.3, 1.3.4, 1.3.5 G part, 1.4.1 G part, 2.9.1, 2.9.3–2.9.5). All return null without GSC. */

export const normUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
const isNoindex = (c: PageContent) => /noindex|none/.test(c.robots ?? '');
const indexable = (c: PageContent) => !isNoindex(c) && (!c.canonical || normUrl(c.canonical) === normUrl(c.url));
const n1 = (v: number) => v.toFixed(1);
const k = (v: number) => Math.round(v).toLocaleString('en-US');

/** Funnel shared by rule 1.3.3 and the Search Console index chart. */
export function indexFunnel({ data, content }: AuditContext) {
  const gsc = data.gsc!;
  const sitemap = new Set(data.preflight.sitemaps.flatMap((s) => s.urls).map(normUrl));
  const withImpr = new Set(gsc.pages.filter((r) => r.impressions > 0).map((r) => normUrl(r.keys[0] ?? '')));
  const inspected = new Map(gsc.inspections.map((i) => [normUrl(i.url), i]));
  const idx = content.filter(indexable);
  const indexed = idx.filter((c) => inspected.get(normUrl(c.url))?.verdict === 'PASS' || withImpr.has(normUrl(c.url)));
  return { crawled: content.length, indexable: idx.length, inSitemap: idx.filter((c) => sitemap.has(normUrl(c.url))).length, indexed, idx };
}

export const gscRules: RuleDef[] = [
  {
    id: '1.3.3', module: 1, category: 'technical', card: 'gsc-index', scope: 'site', severity: 'high',
    title: { client: 'Some pages are not in Google', expert: 'Indexed vs crawled vs sitemap' },
    explain: { client: 'A page that is not in Google’s index cannot appear in search at all.', expert: 'Funnel: crawled → indexable → in sitemap → indexed (URL Inspection sample + pages with impressions).' },
    fix: { client: 'Make sure every important page is linked, in the sitemap, and worth indexing; then request indexing in Search Console.', expert: 'Fix indexability, add to sitemap, strengthen internal links, request indexing.' },
    ice: { impact: 5, confidence: 4, effort: 2 },
    evaluate: (ctx) => {
      if (!ctx.data.gsc || !ctx.content.length) return null;
      const f = indexFunnel(ctx);
      if (!f.indexable) return null;
      const pct = Math.round((f.indexed.length * 100) / f.indexable);
      const missing = f.idx.filter((c) => !f.indexed.includes(c)).map((c) => c.url);
      const basis = `based on ${plural(ctx.data.gsc.inspections.length, 'inspected URL')} and Search Console clicks`;
      return {
        status: pct >= 90 ? 'pass' : pct >= 70 ? 'warn' : 'fail',
        affected: missing,
        applicable: f.indexable,
        metrics: { crawled: f.crawled, indexable: f.indexable, inSitemap: f.inSitemap, indexed: f.indexed.length },
        message: {
          client: missing.length ? `${plural(missing.length, 'page')} of ${f.indexable} ${missing.length === 1 ? 'is' : 'are'} not in Google` : 'Every checked page is in Google',
          expert: `${f.crawled} crawled → ${f.indexable} indexable → ${f.inSitemap} in sitemap → ${f.indexed.length} indexed (${pct}%, ${basis})`,
        },
      };
    },
  },
  {
    id: '1.3.4', module: 1, category: 'technical', card: 'gsc-index', scope: 'page', severity: 'high',
    title: { client: 'Google found pages but chose not to index them', expert: 'Crawled / Discovered – currently not indexed' },
    explain: { client: 'Google saw these pages but left them out, usually because they look thin, duplicated or unimportant.', expert: 'URL Inspection coverageState "Crawled/Discovered – currently not indexed" and other non-PASS verdicts.' },
    fix: { client: 'Improve these pages (more useful content, more internal links) or remove them.', expert: 'Improve quality/uniqueness and internal links; consolidate or noindex low-value URLs.' },
    ice: { impact: 4, confidence: 4, effort: 3 },
    evaluate: ({ data }) => {
      const ins = data.gsc?.inspections ?? [];
      if (!ins.length) return null;
      const ev = countPages(ins, (i) => i.verdict !== 'PASS', (n, total) =>
        n
          ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} known to Google but not indexed`, expert: `${n} of ${total} inspected URLs not indexed (${[...new Set(ins.filter((i) => i.verdict !== 'PASS').map((i) => i.coverageState ?? i.verdict ?? '?'))].slice(0, 3).join('; ')})` }
          : { client: 'Every inspected page is indexed', expert: `All ${total} inspected URLs indexed` });
      return ev && { ...ev, sub: { client: `Checked ${ins.length} pages with Google`, expert: `Based on ${ins.length} inspected URLs${data.gsc!.inspectionQuotaHit ? ' (daily inspection quota reached)' : ''}` } };
    },
  },
  {
    id: '1.3.5-g', module: 1, category: 'technical', card: 'gsc-index', scope: 'site', severity: 'medium',
    title: { client: 'Low-value pages show up in Google', expert: 'Indexed junk with impressions (GSC)' },
    explain: { client: 'Tag, archive and search pages that appear in Google compete with your real pages.', expert: 'Tag/archive/search URLs receiving impressions are indexed.' },
    fix: { client: 'Hide these pages from search engines.', expert: 'noindex the junk templates; remove internal links to them.' },
    ice: { impact: 3, confidence: 4, effort: 1 },
    evaluate: ({ data }) => {
      if (!data.gsc) return null;
      const junk = data.gsc.pages.filter((r) => r.impressions > 0 && INDEXED_JUNK.test(r.keys[0] ?? ''));
      return junk.length
        ? { status: 'warn', affected: junk.map((r) => r.keys[0]!), message: { client: `${plural(junk.length, 'low-value page')} show${junk.length === 1 ? 's' : ''} up in Google`, expert: `${junk.length} tag/archive/search URLs with impressions` } }
        : { status: 'pass', message: { client: 'No low-value pages in Google', expert: 'No junk URLs with impressions' } };
    },
  },
  {
    id: '1.4.1-g', module: 1, category: 'technical', card: 'sitemap', scope: 'site', severity: 'high',
    title: { client: 'Sitemap not submitted to Google', expert: 'Sitemap submitted in Search Console' },
    explain: { client: 'Submitting the sitemap tells Google about every page and shows you problems with it.', expert: 'Sitemaps report: submitted, processed, errors.' },
    fix: { client: 'Submit the sitemap in Google Search Console.', expert: 'Submit the sitemap (Indexing → Sitemaps) and fix reported errors.' },
    ice: { impact: 3, confidence: 5, effort: 1 },
    evaluate: ({ data }) => {
      const s = data.gsc?.sitemaps;
      if (!s) return null;
      if (!s.length) return { status: 'fail', message: { client: 'No sitemap has been submitted to Google', expert: 'No sitemaps submitted for this property' } };
      const errors = s.reduce((n, x) => n + (x.errors ?? 0), 0);
      const pending = s.filter((x) => x.isPending).length;
      if (errors) return { status: 'warn', affected: s.filter((x) => x.errors).map((x) => x.path), message: { client: 'Google reports errors in the sitemap', expert: `${errors} sitemap errors in Search Console` } };
      return { status: 'pass', message: { client: 'Sitemap submitted to Google', expert: `${plural(s.length, 'sitemap')} submitted${pending ? `, ${pending} pending` : ''}; no errors` } };
    },
  },
  {
    id: '2.9.1', module: 2, category: 'onpage', card: 'gsc-perf', scope: 'site', severity: 'high',
    title: { client: 'Your pages compete with each other in Google', expert: 'Keyword cannibalisation' },
    explain: { client: 'When two of your pages chase the same search, Google splits attention between them and both rank lower.', expert: '≥ 2 pages each with ≥ 20% of a query’s impressions.' },
    fix: { client: 'Pick one page for each search and point the others to it.', expert: 'Consolidate, differentiate intent, or canonicalise competing pages.' },
    ice: { impact: 4, confidence: 3, effort: 3 },
    evaluate: ({ data }) => {
      if (!data.gsc) return null;
      const byQuery = new Map<string, { page: string; impressions: number }[]>();
      for (const r of data.gsc.pageQueries) {
        const [page, query] = r.keys;
        if (!page || !query) continue;
        byQuery.set(query, [...(byQuery.get(query) ?? []), { page, impressions: r.impressions }]);
      }
      const hits = [...byQuery].flatMap(([query, rows]) => {
        const total = rows.reduce((s, r) => s + r.impressions, 0);
        const strong = rows.filter((r) => r.impressions / total >= 0.2);
        return total >= 20 && strong.length >= 2 ? [{ query, total, pages: strong.map((r) => pathOf(r.page)) }] : [];
      }).sort((a, b) => b.total - a.total);
      if (!byQuery.size) return null;
      return hits.length
        ? { status: 'warn', affected: hits.slice(0, 100).map((h) => `"${h.query}" → ${h.pages.join(', ')}`), metrics: { queries: hits.length }, message: { client: `${plural(hits.length, 'search')} ${hits.length === 1 ? 'is' : 'are'} split between two or more of your pages`, expert: `${hits.length} cannibalised queries (≥ 2 pages with ≥ 20% impressions each)` } }
        : { status: 'pass', message: { client: 'Each search goes to one page', expert: 'No cannibalised queries' } };
    },
  },
  {
    id: '2.9.3', module: 2, category: 'onpage', card: 'gsc-perf', scope: 'page', severity: 'high',
    title: { client: 'Pages are seen in Google but rarely clicked', expert: 'Impressions but low CTR' },
    explain: { client: 'These pages show up in search but people skip them, often because the title and description are not tempting.', expert: 'CTR < 50% of the expected CTR for the average position, ≥ 100 impressions.' },
    fix: { client: 'Rewrite the title and description of these pages to promise what searchers want.', expert: 'Rewrite titles/meta descriptions; add rich-result schema.' },
    ice: { impact: 4, confidence: 4, effort: 1 },
    evaluate: ({ data }) => {
      if (!data.gsc) return null;
      const rows = data.gsc.pages.filter((r) => r.impressions >= 100).map((r) => ({ url: r.keys[0] ?? '', r }));
      return countPages(rows, ({ r }) => r.ctr < 0.5 * expectedCtr(r.position), (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} seen but rarely clicked`, expert: `${n} pages with CTR under half the expected rate for their position` } : { client: 'Pages get the clicks expected for their position', expert: 'No page below 50% of expected CTR' }, 'warn');
    },
  },
  {
    id: '2.9.4', module: 2, category: 'onpage', card: 'gsc-perf', scope: 'site', severity: 'medium',
    title: { client: 'Searches where you are close to the top', expert: 'Quick wins: positions 4–20' },
    explain: { client: 'You already rank on page one or two for these searches; small improvements can move you into the top three.', expert: 'Queries with average position 4–20 and ≥ 50 impressions.' },
    fix: { client: 'Improve the pages that rank for these searches and link to them more.', expert: 'Strengthen on-page relevance and internal links for these queries.' },
    ice: { impact: 4, confidence: 3, effort: 2 },
    evaluate: ({ data }) => {
      if (!data.gsc || !data.gsc.queries.length) return null;
      const wins = data.gsc.queries.filter((r) => r.position >= 4 && r.position <= 20 && r.impressions >= 50).sort((a, b) => b.impressions - a.impressions);
      return wins.length
        ? { status: 'warn', affected: wins.slice(0, 100).map((r) => `"${r.keys[0]}" · pos ${n1(r.position)} · ${k(r.impressions)} impr.`), metrics: { queries: wins.length }, message: { client: `${plural(wins.length, 'search')} where you are close to the top`, expert: `${wins.length} queries at positions 4–20 with ≥ 50 impressions` } }
        : { status: 'pass', message: { client: 'No near-miss searches found', expert: 'No queries at positions 4–20 with ≥ 50 impressions' } };
    },
  },
  {
    id: '2.9.5', module: 2, category: 'onpage', card: 'gsc-perf', scope: 'page', severity: 'medium',
    title: { client: 'Pages losing traffic', expert: 'Traffic decay vs previous period' },
    explain: { client: 'These pages get far fewer clicks than in the previous period.', expert: 'Clicks down ≥ 30% vs the previous equal period, with ≥ 20 clicks before.' },
    fix: { client: 'Refresh these pages: update facts, improve the content and check competitors.', expert: 'Refresh content, check SERP changes, recover lost links.' },
    ice: { impact: 4, confidence: 3, effort: 3 },
    evaluate: ({ data }) => {
      if (!data.gsc) return null;
      const now = new Map(data.gsc.pages.map((r) => [normUrl(r.keys[0] ?? ''), r.clicks]));
      const before = data.gsc.pagesPrev.filter((r) => r.clicks >= 20).map((r) => ({ url: r.keys[0] ?? '', prev: r.clicks }));
      return countPages(before, (p) => (now.get(normUrl(p.url)) ?? 0) <= p.prev * 0.7, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} losing clicks`, expert: `${n} pages with clicks down ≥ 30% vs the previous ${data.gsc!.rangeDays} days` } : { client: 'No page is losing traffic', expert: 'No page down ≥ 30%' }, 'warn');
    },
  },
];
