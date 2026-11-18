import type { PageContent } from './page-content';
import { nearDuplicates } from './rules-links';
import { cityOf, type PageType, type Template } from './templates';
import { countPages, plural, type AuditContext, type RuleDef } from './types';

/** Rules that need page templates (spec §7): 1.7.2, 1.12.3, 2.1.5, 2.4.1, 2.6.1, 2.9.2. */

const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase();
const LOCAL: PageType[] = ['location', 'service_location'];

function typeMap(templates: Template[] | undefined): Map<string, PageType> {
  const m = new Map<string, PageType>();
  for (const t of templates ?? []) for (const u of t.urls) m.set(norm(u), t.type);
  return m;
}

const pagesOf = ({ data, content }: AuditContext, types: PageType[]): PageContent[] => {
  const m = typeMap(data.templates);
  return content.filter((c) => types.includes(m.get(norm(c.url)) ?? 'other'));
};

const median = (n: number[]) => {
  const s = [...n].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

/** URL structure of a page: its parent path ("/services/", or "/" for root-level pages). */
const pattern = (url: string) => {
  const segs = new URL(url).pathname.split('/').filter(Boolean);
  return segs.length > 1 ? `/${segs.slice(0, -1).join('/')}/` : '/';
};

export const templateRules: RuleDef[] = [
  {
    id: '1.7.2', module: 1, category: 'technical', card: 'urls', scope: 'site', severity: 'low',
    title: { client: 'Similar pages use different address styles', expert: 'Inconsistent URL patterns within a template' },
    explain: { client: 'When pages of the same kind live under different folders, the site is harder to understand.', expert: 'One page type served under several parent paths weakens site structure signals.' },
    fix: { client: 'Keep all service pages (and all location pages) under one folder.', expert: 'Consolidate each template under one URL pattern, with 301s from the old paths.' },
    ice: { impact: 2, confidence: 3, effort: 4 },
    evaluate: ({ data }) => {
      const groups = (data.templates ?? []).filter((t) => ['service', 'location', 'service_location', 'blog_post'].includes(t.type) && t.urls.length >= 2);
      if (!groups.length) return null;
      const mixed = groups.filter((t) => new Set(t.urls.map(pattern)).size > 1);
      if (!mixed.length) return { status: 'pass', message: { client: 'Similar pages share one address style', expert: 'One URL pattern per template' } };
      const detail = mixed.map((t) => `${t.label}: ${[...new Set(t.urls.map(pattern))].join(', ')}`).join('; ');
      return { status: 'warn', affected: mixed.flatMap((t) => t.urls), message: { client: `${plural(mixed.length, 'kind')} of page use${mixed.length === 1 ? 's' : ''} more than one address style`, expert: detail } };
    },
  },
  {
    id: '1.12.3', module: 1, category: 'technical', card: 'links', scope: 'site', severity: 'medium',
    title: { client: 'Service and area pages are missing from the menu', expert: 'Nav/footer coverage of service and location pages' },
    explain: { client: 'Pages linked from the menu or footer are found faster by visitors and Google.', expert: 'Site-wide nav/footer links pass equity to every key page.' },
    fix: { client: 'Add your main services and areas to the menu or footer.', expert: 'Link every service and location page from nav or footer.' },
    ice: { impact: 3, confidence: 4, effort: 1 },
    evaluate: (ctx) => {
      const key = pagesOf(ctx, ['service', 'location', 'service_location']);
      if (!key.length) return null;
      const navTargets = new Set(ctx.content.flatMap((c) => c.links.filter((l) => l.internal && l.inNav).map((l) => norm(l.href))));
      const missing = key.filter((c) => !navTargets.has(norm(c.url)));
      const pct = Math.round(((key.length - missing.length) * 100) / key.length);
      return {
        status: pct >= 80 ? 'pass' : 'warn',
        affected: pct >= 80 ? [] : missing.map((c) => c.url),
        applicable: key.length,
        metrics: { coveragePercent: pct },
        message: pct >= 80
          ? { client: 'Service and area pages are in the menu or footer', expert: `${pct}% of key pages linked from nav/footer` }
          : { client: `${plural(missing.length, 'service or area page')} ${missing.length === 1 ? 'is' : 'are'} not in the menu or footer`, expert: `Nav/footer coverage ${pct}% (${missing.length}/${key.length} missing)` },
      };
    },
  },
  {
    id: '2.1.5', module: 2, category: 'onpage', card: 'titles', scope: 'page', severity: 'medium',
    title: { client: 'Area pages do not name the city in the title', expert: 'Location missing from local page titles' },
    explain: { client: 'People search for a service plus their city; the title should say which city the page covers.', expert: 'Location pages need the city (from URL/H1) in the <title> to rank for local queries.' },
    fix: { client: 'Add the city name to the title of each area page.', expert: 'Include the location in each location-template title.' },
    ice: { impact: 4, confidence: 4, effort: 1 },
    evaluate: (ctx) =>
      countPages(pagesOf(ctx, LOCAL).filter((c) => cityOf(c.url) && c.title), (c) => !(c.title ?? '').toLowerCase().includes(cityOf(c.url)!), (n) =>
        n ? { client: `${plural(n, 'area page')} ${n === 1 ? 'does' : 'do'} not name the city in the title`, expert: `${n} location titles lack the URL city` } : { client: 'Area page titles name their city', expert: 'City present in every location title' }, 'warn'),
  },
  {
    id: '2.4.1', module: 2, category: 'onpage', card: 'content', scope: 'page', severity: 'medium',
    title: { client: 'Some pages are much shorter than the pages that rank', expert: 'Word count < 50% of the ranking pages (or the template median)' },
    explain: { client: 'A page with far less to say than the pages Google shows for the same search is less likely to rank.', expert: 'Depth check: word count vs the median of the top results for the page\'s mapped keyword (Module 5 + cached SERPs); without them, vs the median of the same template.' },
    fix: { client: 'Expand the shortest pages: cover what the pages that rank cover.', expert: 'Bring outliers up to the ranking pages\' (or template) median.' },
    ice: { impact: 3, confidence: 3, effort: 3 },
    evaluate: ({ data, content }) => {
      // Pages with the ranking pages' word counts are compared with those; the rest with their template.
      const rivals = data.rivalWords ?? {};
      const vsRivals = content.filter((c) => (rivals[norm(c.url)]?.length ?? 0) > 0);
      if (vsRivals.length) {
        const rivalThin = new Set(vsRivals.filter((c) => c.words < median(rivals[norm(c.url)]!) / 2).map((c) => c.url));
        return countPages(vsRivals, (c) => rivalThin.has(c.url), (n) =>
          n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} much shorter than the pages that rank for ${n === 1 ? 'its' : 'their'} search`, expert: `${n} mapped pages under half the median word count of the top results` } : { client: 'Your key pages are as deep as the pages that rank', expert: 'No mapped page under half the top results\' median word count' }, 'warn');
      }
      const byUrl = new Map(content.map((c) => [norm(c.url), c]));
      const groups = (data.templates ?? [])
        .filter((t) => !['home', 'contact', 'legal', 'category', 'about', 'blog_index'].includes(t.type))
        .map((t) => t.urls.map((u) => byUrl.get(norm(u))).filter((c): c is PageContent => Boolean(c)))
        .filter((g) => g.length >= 3);
      if (!groups.length) return null;
      const thin = new Set(groups.flatMap((g) => {
        const m = median(g.map((c) => c.words));
        return g.filter((c) => c.words < m / 2).map((c) => c.url);
      }));
      return countPages(groups.flat(), (c) => thin.has(c.url), (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} much shorter than similar pages`, expert: `${n} pages under half their template's median word count` } : { client: 'Similar pages have similar depth', expert: 'No page under half its template median' }, 'warn');
    },
  },
  {
    id: '2.6.1', module: 2, category: 'onpage', card: 'links', scope: 'page', severity: 'medium',
    title: { client: 'Service and area pages do not link to each other', expert: 'Service ↔ location cross-linking' },
    explain: { client: 'Linking each service to the areas you cover (and back) helps visitors and Google connect them.', expert: 'Service pages should link ≥ 1 location page and vice versa.' },
    fix: { client: 'On each service page, list the areas you serve; on each area page, list your services.', expert: 'Add service↔location contextual links.' },
    ice: { impact: 3, confidence: 4, effort: 2 },
    evaluate: (ctx) => {
      const services = pagesOf(ctx, ['service']);
      const locations = pagesOf(ctx, LOCAL);
      if (!services.length || !locations.length) return null;
      const m = typeMap(ctx.data.templates);
      const linksTo = (c: PageContent, types: PageType[]) => c.links.some((l) => l.internal && !l.inNav && types.includes(m.get(norm(l.href)) ?? 'other'));
      return countPages([...services, ...locations], (c) => (services.includes(c) ? !linksTo(c, LOCAL) : !linksTo(c, ['service', 'service_location'])), (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'does' : 'do'} not link between services and areas`, expert: `${n} service/location pages without a cross-link` } : { client: 'Services and areas link to each other', expert: 'Every service/location page cross-links' }, 'warn');
    },
  },
  {
    id: '2.9.2', module: 2, category: 'onpage', card: 'content', scope: 'page', severity: 'critical',
    title: { client: 'Area pages are copies of each other', expert: 'Duplicate location/service pages' },
    explain: { client: 'Area pages that only swap the city name are treated as copies, and Google may ignore them all.', expert: 'Near-duplicate (≥ 90%) location-template pages (doorway-page risk).' },
    fix: { client: 'Give each area page its own content: local projects, reviews, landmarks and details.', expert: 'Differentiate location pages with unique local content, or consolidate.' },
    ice: { impact: 5, confidence: 4, effort: 4 },
    evaluate: (ctx) => {
      const local = pagesOf(ctx, LOCAL);
      if (local.length < 2) return null;
      const dup = new Set(nearDuplicates(local));
      return countPages(local, (c) => dup.has(c.url), (n) =>
        n ? { client: `${plural(n, 'area page')} ${n === 1 ? 'is a copy' : 'are copies'} of another`, expert: `${n} location pages ≥ 90% similar` } : { client: 'Each area page is unique', expert: 'No near-duplicate location pages' });
    },
  },
];
