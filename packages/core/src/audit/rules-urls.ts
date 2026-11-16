import type { PageContent } from './page-content';
import { countPages, pathOf, plural, type AuditContext, type RuleDef } from './types';

/** Module 1 URL, crawl-budget and sitemap-quality rules (spec §6.2, batch B). */

const TRAP = /[?&](date|day|month|year|calendar|time|ical|outlook-ical|replytocom|sort|order|orderby|filter_[a-z_]+|price_min|price_max)=|[?&]s=|\/search(\/|\?|$)|\/calendar\/|\/events?\/\d{4}-\d{2}/i;
const JUNK = /[?&](replytocom|attachment_id|p|page_id|s)=|\/(tag|tags|author|attachment|feed|trackback|wp-json)\/|\/page\/\d+\/?$|[?&](page|paged|pg)=\d+/i;
export const INDEXED_JUNK = /\/(tag|tags|author|category|archives?|search)\/|[?&]s=|\/\d{4}\/\d{2}\/?$/i;
const PAGINATED = /\/page\/(\d+)\/?$|[?&](?:page|paged|pg)=(\d+)/i;
const SESSION = /[?&](sid|sessionid|session_id|phpsessid|jsessionid|aspsessionid|cfid|cftoken|utm_[a-z]+|gclid|fbclid)=/i;
const SOFT_404 = /\b(page not found|not found|404|no longer (available|exists)|page (you requested |)(does not|doesn['’]t|could not|cannot|can['’]t) (exist|be found))\b/i;

const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase();
const isNoindex = (c: PageContent) => /noindex|none/.test(c.robots ?? '');
const canonicalElsewhere = (c: PageContent) => Boolean(c.canonical) && norm(c.canonical!) !== norm(c.url);

/** Every same-site URL we know of: checked pages plus the internal links found on them. */
function knownUrls({ html, content }: AuditContext): { url: string; from?: string }[] {
  const seen = new Map<string, string | undefined>();
  for (const p of html) seen.set(p.url, undefined);
  for (const c of content) for (const l of c.links) if (l.internal && !seen.has(l.href)) seen.set(l.href, c.url);
  return [...seen].map(([url, from]) => ({ url, from }));
}

const pathKey = (url: string) => {
  try {
    const u = new URL(url);
    return u.search ? u.origin + u.pathname : null;
  } catch {
    return null;
  }
};

export const urlRules: RuleDef[] = [
  {
    id: '1.1.1', module: 1, category: 'technical', card: 'domains', scope: 'site', severity: 'info',
    title: { client: 'Website addresses checked', expert: 'Domain variants' },
    explain: { client: 'We checked every version of your address (with and without www, http and https).', expert: 'http/https × www/non-www resolution; consolidation is scored by 1.6.3.' },
    fix: { client: 'Nothing to do.', expert: 'None.' },
    ice: { impact: 1, confidence: 5, effort: 1 },
    evaluate: ({ data }) => {
      const v = data.preflight.variants;
      if (!v.length) return null;
      const list = v.map((x) => `${x.url} → ${x.status}${x.location ? ` ${x.location}` : ''}`).join('; ');
      return { status: 'info', message: { client: `Main address: ${data.preflight.homepage.finalUrl}`, expert: `Preferred ${data.preflight.homepage.finalUrl}. ${list}` } };
    },
  },
  {
    id: '1.1.2', module: 1, category: 'technical', card: 'indexing', scope: 'site', severity: 'info',
    title: { client: 'Part of the site was checked', expert: 'Crawl limit vs site size' },
    explain: { client: 'The audit checks up to the page limit you chose; larger sites have more pages than that.', expert: 'Pages crawled hit the limit while the sitemap lists more URLs: results are a sample.' },
    fix: { client: 'Run a deep crawl with a higher page limit to cover more of the site.', expert: 'Raise the page limit or use deep mode.' },
    ice: { impact: 1, confidence: 5, effort: 1 },
    evaluate: ({ data, html }) => {
      const total = data.preflight.sitemapUrlTotal;
      if (html.length < data.pageLimit || total <= html.length) return null;
      return { status: 'info', metrics: { checked: html.length, sitemap: total }, message: { client: `Checked ${html.length} of about ${total} pages`, expert: `Crawled ${html.length} (limit ${data.pageLimit}); sitemap lists ${total} URLs — crawl may be incomplete` } };
    },
  },
  {
    id: '1.1.4', module: 1, category: 'technical', card: 'indexing', scope: 'site', severity: 'info',
    title: { client: 'Page code read', expert: 'Raw HTML read' },
    explain: { client: 'Recorded for reference.', expert: 'Raw HTML fetched and parsed per page (page-content).' },
    fix: { client: 'Nothing to do.', expert: 'None.' },
    ice: { impact: 1, confidence: 5, effort: 1 },
    evaluate: ({ content, html }) =>
      html.length ? { status: 'info', message: { client: `Read the code of ${plural(content.length, 'page')}`, expert: `Raw HTML parsed for ${content.length}/${html.length} pages` } } : null,
  },
  {
    id: '1.1.5', module: 1, category: 'technical', card: 'indexing', scope: 'site', severity: 'info',
    title: { client: 'Audit date', expert: 'Crawl date (baseline)' },
    explain: { client: 'Future audits are compared with this one.', expert: 'Baseline timestamp for diffs.' },
    fix: { client: 'Nothing to do.', expert: 'None.' },
    ice: { impact: 1, confidence: 5, effort: 1 },
    evaluate: ({ data }) => ({ status: 'info', message: { client: `Checked on ${data.crawledAt.slice(0, 10)}`, expert: `Crawled ${data.crawledAt} (${data.mode} mode)` } }),
  },
  {
    id: '1.2.5', module: 1, category: 'technical', card: 'urls', scope: 'site', severity: 'medium',
    title: { client: 'Links that create endless pages', expert: 'Crawl traps (calendars, search, filters)' },
    explain: { client: 'Calendars, search results and filters can create thousands of near-empty pages that waste Google’s time.', expert: 'Date/calendar/search/filter parameters and param-only URL explosions trap crawlers.' },
    fix: { client: 'Ask your developer to stop search engines following search, filter and calendar links.', expert: 'Disallow trap patterns in robots.txt, add rel=nofollow, or canonicalise parameters.' },
    ice: { impact: 3, confidence: 3, effort: 2 },
    evaluate: (ctx) => {
      const urls = knownUrls(ctx);
      if (urls.length < 5) return null;
      const byPath = new Map<string, number>();
      for (const { url } of urls) {
        const k = pathKey(url);
        if (k) byPath.set(k, (byPath.get(k) ?? 0) + 1);
      }
      const exploding = new Set([...byPath].filter(([, n]) => n >= 10).map(([k]) => k));
      const traps = urls.filter(({ url }) => TRAP.test(url) || exploding.has(pathKey(url) ?? ''));
      const sources = [...new Set(traps.map((t) => t.from ?? t.url))];
      return traps.length
        ? { status: 'warn', affected: sources, metrics: { trapUrls: traps.length }, message: { client: `${plural(traps.length, 'link')} lead into search, filter or calendar pages`, expert: `${traps.length} trap-pattern URLs (e.g. ${pathOf(traps[0]!.url)})` } }
        : { status: 'pass', message: { client: 'No endless-page traps found', expert: 'No crawl-trap patterns in known URLs' } };
    },
  },
  {
    id: '1.2.6', module: 1, category: 'technical', card: 'urls', scope: 'site', severity: 'medium',
    title: { client: 'Search engines waste time on low-value pages', expert: 'Crawl budget waste' },
    explain: { client: 'Tag, author, feed and page-2 links pull Google away from your real pages.', expert: 'Share of known URLs that are parameter, tag, author, attachment, feed or paginated junk.' },
    fix: { client: 'Hide tag, author and attachment pages from search engines.', expert: 'noindex/disallow junk archives; remove links to them from templates.' },
    ice: { impact: 3, confidence: 3, effort: 2 },
    evaluate: (ctx) => {
      const urls = knownUrls(ctx);
      if (urls.length < 10) return null;
      const junk = urls.filter(({ url }) => JUNK.test(url));
      const pct = Math.round((junk.length * 100) / urls.length);
      return {
        status: pct > 30 ? 'fail' : pct > 15 ? 'warn' : 'pass',
        affected: pct > 15 ? junk.map((j) => j.url) : [],
        applicable: urls.length,
        metrics: { junkPercent: pct },
        message: pct > 15
          ? { client: `${pct}% of links go to low-value pages`, expert: `${junk.length}/${urls.length} known URLs are junk (${pct}%)` }
          : { client: 'Links mostly go to useful pages', expert: `${pct}% junk URLs` },
      };
    },
  },
  {
    id: '1.3.5', module: 1, category: 'technical', card: 'indexing', scope: 'page', severity: 'medium',
    title: { client: 'Low-value pages can appear in Google', expert: 'Indexable tag/archive/search pages' },
    explain: { client: 'Tag, archive and search pages are thin copies of your content and compete with real pages.', expert: 'Indexable archives/search results dilute quality signals.' },
    fix: { client: 'Hide these pages from search engines (your SEO plugin has a setting).', expert: 'Add noindex to tag/author/archive/search templates.' },
    ice: { impact: 3, confidence: 4, effort: 1 },
    evaluate: ({ content }) =>
      countPages(content.filter((c) => INDEXED_JUNK.test(c.url)), (c) => !isNoindex(c) && !canonicalElsewhere(c), (n) =>
        n ? { client: `${plural(n, 'low-value page')} can appear in Google`, expert: `${n} indexable tag/archive/search URLs` } : { client: 'Low-value pages are hidden from Google', expert: 'Archive/search URLs are noindex or canonicalised' }, 'warn'),
  },
  {
    id: '1.4.2', module: 1, category: 'technical', card: 'sitemap', scope: 'page', severity: 'high',
    title: { client: 'Sitemap lists pages hidden from Google', expert: 'Noindex or non-canonical URLs in sitemap' },
    explain: { client: 'The sitemap should only list pages you want in Google.', expert: 'Sitemap URLs must be indexable and self-canonical; mixed signals waste crawl.' },
    fix: { client: 'Remove hidden and duplicate pages from the sitemap.', expert: 'Exclude noindex and canonicalised URLs from the sitemap.' },
    ice: { impact: 3, confidence: 4, effort: 2 },
    evaluate: ({ data, content }) => {
      const inSitemap = new Set(data.preflight.sitemaps.flatMap((s) => s.urls).map(norm));
      if (!inSitemap.size) return null;
      return countPages(content.filter((c) => inSitemap.has(norm(c.url))), (c) => isNoindex(c) || canonicalElsewhere(c), (n) =>
        n ? { client: `${plural(n, 'page')} in the sitemap ${n === 1 ? 'is' : 'are'} hidden or duplicates`, expert: `${n} sitemap URLs are noindex or canonicalised elsewhere` } : { client: 'Sitemap lists only real pages', expert: 'Checked sitemap URLs are indexable and self-canonical' });
    },
  },
  {
    id: '1.4.5', module: 1, category: 'technical', card: 'sitemap', scope: 'site', severity: 'low',
    title: { client: 'Sitemap is one very large file', expert: 'Large flat sitemap (no index)' },
    explain: { client: 'Splitting a big sitemap by type makes problems easier to spot.', expert: '> 1,000 URLs in a single flat sitemap; split by type (max 50,000 per file).' },
    fix: { client: 'Split the sitemap into smaller ones (pages, posts, services).', expert: 'Use a sitemap index with per-type child sitemaps.' },
    ice: { impact: 1, confidence: 5, effort: 2 },
    evaluate: ({ data }) => {
      const files = data.preflight.sitemaps.filter((s) => s.valid);
      if (!files.length) return null;
      const big = files.filter((s) => !s.isIndex && s.urls.length > 1000);
      const hasIndex = files.some((s) => s.isIndex);
      if (!big.length || hasIndex) return { status: 'pass', message: { client: 'Sitemap size is fine', expert: hasIndex ? 'Sitemap index in use' : 'No flat sitemap over 1,000 URLs' } };
      const over = big.some((s) => s.urls.length > 50_000);
      return { status: over ? 'fail' : 'warn', affected: big.map((s) => s.url), message: { client: 'The sitemap is one very large file', expert: `${big.map((s) => `${pathOf(s.url)} (${s.urls.length})`).join(', ')} without a sitemap index` } };
    },
  },
  {
    id: '1.5.4', module: 1, category: 'technical', card: 'errors', scope: 'site', severity: 'medium',
    title: { client: 'Temporary redirects used for permanent moves', expert: '302/307 instead of 301' },
    explain: { client: 'A temporary redirect tells Google to keep the old address, so the new page may not get credit.', expert: 'Same-site 302/307 that persist should be 301/308.' },
    fix: { client: 'Change these redirects to permanent (301).', expert: 'Replace 302/307 with 301/308.' },
    ice: { impact: 3, confidence: 4, effort: 1 },
    evaluate: ({ data }) => {
      const temp = (s: number) => s === 302 || s === 307;
      const urls = [
        ...data.preflight.variants.filter((v) => temp(v.status)).map((v) => v.url),
        ...data.preflight.sitemapUrlChecks.filter((c) => temp(c.status)).map((c) => c.url),
        ...data.pages.filter((p) => temp(p.status_code)).map((p) => p.url),
      ];
      const unique = [...new Set(urls)];
      if (!data.preflight.variants.length && !data.pages.length) return null;
      return unique.length
        ? { status: 'warn', affected: unique, message: { client: `${plural(unique.length, 'address', 'addresses')} use${unique.length === 1 ? 's' : ''} a temporary redirect`, expert: `${unique.length} URLs answer 302/307` } }
        : { status: 'pass', message: { client: 'Redirects are permanent', expert: 'No 302/307 found' } };
    },
  },
  {
    id: '1.5.6', module: 1, category: 'technical', card: 'errors', scope: 'page', severity: 'low',
    title: { client: 'Error pages that look normal to Google', expert: 'Soft 404s' },
    explain: { client: 'A "page not found" message that still returns OK to Google gets indexed as a real page.', expert: '200 responses with not-found content should return 404/410.' },
    fix: { client: 'Make missing pages return a proper "not found" code.', expert: 'Return 404/410 for missing content.' },
    ice: { impact: 2, confidence: 3, effort: 2 },
    evaluate: ({ content }) =>
      countPages(content, (c) => c.words < 250 && SOFT_404.test(`${c.title ?? ''} ${c.h1.join(' ')}`), (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'says' : 'say'} "not found" but ${n === 1 ? 'answers' : 'answer'} OK`, expert: `${n} soft 404s (200 + not-found title/H1)` } : { client: 'No hidden error pages', expert: 'No soft 404s' }, 'warn'),
  },
  {
    id: '1.6.4', module: 1, category: 'technical', card: 'canonical', scope: 'site', severity: 'medium',
    title: { client: 'The same page loads at slightly different addresses', expert: 'Trailing-slash / case duplicates' },
    explain: { client: 'If a page loads both with and without a final "/", Google sees two copies.', expert: 'Slash/case variants returning 200 without canonicalising create duplicates.' },
    fix: { client: 'Ask your developer to redirect the other version to the main one.', expert: '301 the non-preferred slash/case variant, or canonicalise it.' },
    ice: { impact: 3, confidence: 4, effort: 2 },
    evaluate: ({ data }) => {
      const probes = data.probes ?? [];
      if (!probes.length) return null;
      const dup = probes.filter((p) => p.duplicate);
      return dup.length
        ? { status: 'warn', affected: dup.map((p) => p.variant), metrics: { probed: probes.length }, message: { client: `${plural(dup.length, 'page')} also ${dup.length === 1 ? 'loads' : 'load'} at a second address`, expert: `${dup.length}/${probes.length} variants (${[...new Set(dup.map((p) => p.kind))].join(', ')}) return 200 without canonical` } }
        : { status: 'pass', message: { client: 'Each page has one address', expert: `${probes.length} slash/case variants redirect or canonicalise` } };
    },
  },
  {
    id: '1.6.5', module: 1, category: 'technical', card: 'canonical', scope: 'page', severity: 'medium',
    title: { client: 'Pages with extra address codes are treated as separate pages', expert: 'Indexable self-canonical parameter URLs' },
    explain: { client: 'Addresses with "?…" codes can be copies of real pages.', expert: 'Parameter URLs that are indexable and self-canonical duplicate the clean URL.' },
    fix: { client: 'Point these pages to the clean address.', expert: 'Canonicalise parameter URLs to the clean URL.' },
    ice: { impact: 3, confidence: 4, effort: 2 },
    evaluate: ({ content }) =>
      countPages(content.filter((c) => new URL(c.url).search), (c) => !isNoindex(c) && !canonicalElsewhere(c), (n) =>
        n ? { client: `${plural(n, 'page')} with "?" codes ${n === 1 ? 'is' : 'are'} treated as separate`, expert: `${n} indexable self-canonical parameter URLs` } : { client: 'Address codes are handled', expert: 'Parameter URLs canonicalised' }, 'warn'),
  },
  {
    id: '1.6.7', module: 1, category: 'technical', card: 'canonical', scope: 'page', severity: 'low',
    title: { client: 'Page 2, 3… of lists are hidden', expert: 'Paginated pages canonicalised to page 1 or noindex' },
    explain: { client: 'Later pages of a list help Google find older items; hiding them hides those items.', expert: 'Paginated URLs should be self-canonical and crawlable.' },
    fix: { client: 'Let each page of a list stand on its own.', expert: 'Self-canonical paginated pages; remove noindex.' },
    ice: { impact: 2, confidence: 4, effort: 1 },
    evaluate: ({ content }) =>
      countPages(content.filter((c) => PAGINATED.test(c.url)), (c) => isNoindex(c) || canonicalElsewhere(c), (n) =>
        n ? { client: `${plural(n, 'list page')} ${n === 1 ? 'is' : 'are'} hidden`, expert: `${n} paginated URLs noindex or canonicalised away` } : { client: 'List pages are crawlable', expert: 'Paginated pages self-canonical' }, 'warn'),
  },
  {
    id: '1.7.3', module: 1, category: 'technical', card: 'urls', scope: 'site', severity: 'medium',
    title: { client: 'Internal links carry tracking or session codes', expert: 'Session IDs / tracking params in internal links' },
    explain: { client: 'Tracking codes on your own links create duplicate addresses and spoil analytics.', expert: 'sid/phpsessid/utm_/gclid on internal links create duplicates and break attribution.' },
    fix: { client: 'Remove tracking codes from links between your own pages.', expert: 'Strip session/utm params from internal hrefs.' },
    ice: { impact: 2, confidence: 4, effort: 1 },
    evaluate: ({ content }) => {
      if (!content.length) return null;
      const pages = content.filter((c) => SESSION.test(c.url) || c.links.some((l) => l.internal && SESSION.test(l.href)));
      return pages.length
        ? { status: 'warn', affected: pages.map((c) => c.url), applicable: content.length, message: { client: `${plural(pages.length, 'page')} ${pages.length === 1 ? 'has' : 'have'} links with tracking codes`, expert: `${pages.length} pages link internally with session/utm params` } }
        : { status: 'pass', message: { client: 'Internal links are clean', expert: 'No session/utm params on internal links' } };
    },
  },
];
