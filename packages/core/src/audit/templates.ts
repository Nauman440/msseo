import type { PageContent } from './page-content';

/**
 * Page templates (spec §7): every indexable 200 page gets a PageType from URL patterns,
 * then schema, then a first-path-segment cluster. One representative per template (most
 * internal inlinks, then shortest URL) is measured with Lighthouse.
 */
export type PageType = 'home' | 'service' | 'location' | 'service_location' | 'blog_post' | 'blog_index' | 'category' | 'contact' | 'about' | 'legal' | 'other';

export type Template = {
  type: PageType;
  /** "Service pages", or "Other: /products/" for clusters. */
  label: string;
  urls: string[];
  representative: string;
};

export const TYPE_LABEL: Record<PageType, string> = {
  home: 'Homepage',
  service: 'Service pages',
  location: 'Location pages',
  service_location: 'Service + location pages',
  blog_post: 'Blog posts',
  blog_index: 'Blog index',
  category: 'Category / tag pages',
  contact: 'Contact',
  about: 'About',
  legal: 'Legal',
  other: 'Other',
};

const SERVICE_SEG = /^(services?|what-we-do|solutions|our-services)$/;
const SERVICE_SLUG = /(^|-)(ac|air-conditioning|aircon|hvac|heating|cooling|furnace|heat-pumps?|boilers?|ducts?|ductless|mini-split|repairs?|installation|install|replacement|maintenance|tune-up|plumbing|plumber|drain|water-heaters?|electrical|electrician|roofing|cleaning|inspection|emergency)(-|$)/;
const LOCATION_SEG = /^(areas?|locations?|service-areas?|cities|city|near-me|areas-we-serve|where-we-serve|communities)$/;
// Common US metros + Pakistan's largest cities, matched as whole slug words ("ac-repair-dallas").
const CITIES = 'atlanta austin baltimore boston charlotte chicago cincinnati cleveland columbus dallas denver detroit el-paso fort-worth fresno houston indianapolis jacksonville kansas-city las-vegas long-beach los-angeles louisville memphis mesa miami milwaukee minneapolis nashville new-york oakland oklahoma-city omaha orlando philadelphia phoenix pittsburgh plano portland raleigh richmond sacramento san-antonio san-diego san-francisco san-jose seattle st-louis tampa tucson tulsa virginia-beach washington arlington irving frisco mckinney garland scottsdale chandler gilbert tempe aurora boulder marietta alpharetta roswell karachi lahore islamabad rawalpindi faisalabad multan peshawar quetta sialkot gujranwala hyderabad dubai sharjah abu-dhabi london manchester birmingham toronto';
const CITY_RE = new RegExp(`(^|-)(${CITIES.split(' ').join('|')})(-|$)`);

const segments = (url: string) => new URL(url).pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s).toLowerCase());

/** The city named in a location URL (slug words after a location segment, or a known city), for rule 2.1.5. */
export function cityOf(url: string): string | undefined {
  const segs = segments(url);
  const i = segs.findIndex((s) => LOCATION_SEG.test(s));
  if (i >= 0 && segs[i + 1]) return segs[i + 1]!.replace(/-/g, ' ');
  for (const s of segs) {
    const m = s.match(CITY_RE);
    if (m) return m[2]!.replace(/-/g, ' ');
  }
  return undefined;
}

export function classifyPage(url: string, c?: PageContent): PageType {
  const segs = segments(url);
  const path = `/${segs.join('/')}`;
  if (!segs.length) return 'home';
  if (/^\/(category|tag|tags|author)\//.test(path)) return 'category';
  if (/^\/(blog|news|articles?|insights|resources|posts?)\/?$/.test(path)) return 'blog_index';
  if (/^\/(blog|news|articles?|insights|posts?)\/.+/.test(path) || /\/\d{4}\/\d{2}\//.test(path)) return 'blog_post';
  if (/^\/(contact|contact-us|get-in-touch|book|schedule|request-service)\/?$/.test(path)) return 'contact';
  if (/^\/(about|about-us|team|our-team|our-story|who-we-are|company)\/?$/.test(path)) return 'about';
  if (/(privacy|terms|cookie|disclaimer|accessibility|legal|refund)/.test(path)) return 'legal';

  const last = segs[segs.length - 1]!;
  const isService = segs.some((s) => SERVICE_SEG.test(s)) || SERVICE_SLUG.test(last);
  const isLocation = segs.some((s) => LOCATION_SEG.test(s)) || segs.some((s) => CITY_RE.test(s));
  if (isService && isLocation) return 'service_location';
  if (isService) return 'service';
  if (isLocation) return 'location';

  const types = c?.schemaTypes ?? [];
  if (types.some((t) => /^(Article|BlogPosting|NewsArticle)$/.test(t))) return 'blog_post';
  if (types.includes('Service')) return 'service';
  if (types.some((t) => /LocalBusiness|HVACBusiness|Plumber|Electrician|RoofingContractor/.test(t))) return 'location';
  return 'other';
}

const PRIORITY: PageType[] = ['home', 'service', 'location', 'service_location', 'blog_post', 'contact', 'about', 'blog_index', 'category', 'legal'];

/**
 * Groups pages into templates. `inlinks` counts internal links pointing at each URL
 * (the crawl's count in deep mode, links between the checked pages in quick mode).
 */
export function buildTemplates(pages: { url: string; content?: PageContent }[], inlinks: Map<string, number>): Template[] {
  const groups = new Map<string, { type: PageType; label: string; urls: string[] }>();
  for (const p of pages) {
    const type = classifyPage(p.url, p.content);
    const key = type === 'other' ? `other:${segments(p.url)[0] ?? ''}` : type;
    const label = type === 'other' ? `Other: /${segments(p.url)[0] ?? ''}/` : TYPE_LABEL[type];
    const g = groups.get(key) ?? { type, label, urls: [] };
    g.urls.push(p.url);
    groups.set(key, g);
  }
  const rank = (t: PageType) => (t === 'other' ? PRIORITY.length : PRIORITY.indexOf(t));
  return [...groups.values()]
    .sort((a, b) => rank(a.type) - rank(b.type) || b.urls.length - a.urls.length)
    .map((g) => ({
      ...g,
      representative: [...g.urls].sort((a, b) => (inlinks.get(b) ?? 0) - (inlinks.get(a) ?? 0) || a.length - b.length)[0]!,
    }));
}

/** Internal inlinks per URL, counted as distinct linking pages among the checked pages. */
export function inlinksFromContent(content: PageContent[]): Map<string, number> {
  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const byNorm = new Map(content.map((c) => [norm(c.url), c.url]));
  const counts = new Map<string, number>();
  for (const c of content) {
    const targets = new Set(c.links.filter((l) => l.internal).map((l) => byNorm.get(norm(l.href))).filter((u): u is string => Boolean(u) && u !== c.url));
    for (const t of targets) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}
