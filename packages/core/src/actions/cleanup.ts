import type { ReportPage } from '../types';
import type { AiPlanTask, BusinessKind } from './ai-plan';

/**
 * Rules 20–23 of the action plan: the site-wide on-page clean-up. In month 1, one task per item type
 * (titles, descriptions, H1, canonicals, alt text, Open Graph) and page group covers every indexable
 * page from the crawl; canonicals come first; alt text and Open Graph need no approval; one ongoing
 * task checks new and changed pages every week.
 */
export const SITE_WIDE_ITEMS = ['none', 'canonical', 'meta_title', 'meta_description', 'h1', 'alt_text', 'schema', 'open_graph', 'weekly_check'] as const;
export const PAGE_GROUPS = ['none', 'money_pages', 'products', 'collections', 'articles', 'other'] as const;
export type SiteWideItem = (typeof SITE_WIDE_ITEMS)[number];
export type PageGroup = (typeof PAGE_GROUPS)[number];
export type CleanupItem = Exclude<SiteWideItem, 'none' | 'weekly_check'>;
export const CLEANUP_ITEMS: CleanupItem[] = ['canonical', 'meta_title', 'meta_description', 'h1', 'alt_text', 'schema', 'open_graph'];

/** Rule 22: alt text, schema and Open Graph go live without approval; the rest after the client's yes. */
export const CLEANUP_DOER: Record<CleanupItem, 'automatic' | 'automatic_no_approval'> = {
  canonical: 'automatic', meta_title: 'automatic', meta_description: 'automatic', h1: 'automatic', alt_text: 'automatic_no_approval', schema: 'automatic_no_approval', open_graph: 'automatic_no_approval',
};
/** Rule 21: canonicals in week 1, the text changes after them. */
const CLEANUP_WEEK: Record<CleanupItem, number> = { canonical: 1, meta_title: 2, meta_description: 2, h1: 2, alt_text: 3, schema: 3, open_graph: 3 };
export const AFTER_CANONICAL: SiteWideItem[] = ['meta_title', 'meta_description', 'h1'];

const ITEM_LABEL: Record<CleanupItem, string> = {
  canonical: 'Canonical tags', meta_title: 'Page titles', meta_description: 'Meta descriptions', h1: 'Main headings (H1)', alt_text: 'Image alt text', schema: 'Schema (Organization, WebSite, BreadcrumbList)', open_graph: 'Open Graph tags (link previews)',
};
const GROUP_LABEL: Record<Exclude<PageGroup, 'none'>, string> = { money_pages: 'main pages', products: 'product pages', collections: 'collection pages', articles: 'articles', other: 'other pages' };

/** One crawled page as the plan sees it for the clean-up (null = not known for older reports). */
export type CleanupPage = {
  url: string;
  group: Exclude<PageGroup, 'none'>;
  indexable: boolean;
  title_length: number | null;
  description_length: number | null;
  h1_count: number | null;
  canonical: 'self' | 'missing' | 'other' | 'unknown';
  /** Address looks like a variant, filter, tag, pagination or nested product URL (rule 21). */
  variant_url: boolean;
  images_without_alt: number | null;
  open_graph_missing: string[] | null;
  /** Item types this page needs work on (all six when the report predates these fields). */
  needs: CleanupItem[];
};

const pathOf = (u: string) => {
  try {
    return new URL(u).pathname.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
};
const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();

export function pageGroupOf(p: Pick<ReportPage, 'url' | 'pageType' | 'schemaTypes'>, kind: BusinessKind): Exclude<PageGroup, 'none'> {
  const path = pathOf(p.url);
  if (/\/products?\//.test(path) || p.schemaTypes.includes('Product')) return 'products';
  if (/\/(collections?|product-category|shop)\//.test(path) || (kind === 'ecommerce' && p.pageType === 'category')) return 'collections';
  if (p.pageType === 'blog_post' || p.pageType === 'blog_index' || /\/(blog|news|articles?|guides?)\//.test(path)) return 'articles';
  if (['home', 'service', 'location', 'service_location', 'contact'].includes(p.pageType ?? '')) return 'money_pages';
  return 'other';
}

/** Rule 4: Organization and WebSite on the homepage, BreadcrumbList on every other page. */
export function missingSchema(p: Pick<ReportPage, 'url' | 'pageType' | 'schemaTypes'>): string[] {
  const has = (re: RegExp) => p.schemaTypes.some((t) => re.test(t));
  if (p.pageType === 'home') return [has(/Organization|LocalBusiness|Store/) ? '' : 'Organization', has(/^WebSite$/) ? '' : 'WebSite'].filter(Boolean);
  return has(/BreadcrumbList/) ? [] : ['BreadcrumbList'];
}

/** Variant, filter, tag, pagination or nested product addresses that should point to a clean URL. */
export const isVariantUrl = (u: string) => {
  const path = pathOf(u);
  return /[?&](variant|filter|sort|page|color|colour|size|orderby)=/i.test(u) || /\/page\/\d+/.test(path) || /\/tags?\//.test(path) || /\/collections\/[^/]+\/products\//.test(path);
};

export function cleanupPages(pages: ReportPage[], kind: BusinessKind): CleanupPage[] {
  const count = (vals: (string | null | undefined)[]) => {
    const m = new Map<string, number>();
    for (const v of vals) if (v) m.set(v.trim().toLowerCase(), (m.get(v.trim().toLowerCase()) ?? 0) + 1);
    return m;
  };
  const titles = count(pages.map((p) => p.title));
  const descriptions = count(pages.map((p) => p.description));
  return pages.map((p) => {
    const known = p.h1Count !== undefined;
    const canonical = !known ? 'unknown' : !p.canonical ? 'missing' : norm(p.canonical) === norm(p.url) ? 'self' : 'other';
    const variant = isVariantUrl(p.url);
    const indexable = !p.noindex && canonical !== 'other';
    const og = p.openGraph ? Object.entries(p.openGraph).filter(([, v]) => !v).map(([k]) => `og:${k}`) : null;
    const tl = p.title ? p.title.length : 0;
    const dl = p.description ? p.description.length : 0;
    const needs: CleanupItem[] = !known
      ? [...CLEANUP_ITEMS]
      : CLEANUP_ITEMS.filter((item) => {
        switch (item) {
          case 'canonical': return (indexable && canonical === 'missing') || (variant && canonical !== 'other');
          case 'meta_title': return indexable && (!tl || tl < 30 || tl > 60 || (titles.get(p.title!.trim().toLowerCase()) ?? 0) > 1);
          case 'meta_description': return indexable && (!dl || dl < 70 || dl > 160 || (descriptions.get(p.description!.trim().toLowerCase()) ?? 0) > 1);
          case 'h1': return indexable && p.h1Count !== 1;
          case 'alt_text': return (p.imagesNoAlt ?? 0) > 0;
          case 'schema': return indexable && missingSchema(p).length > 0;
          case 'open_graph': return indexable && (og === null || og.length > 0);
        }
      });
    return {
      url: p.url,
      group: pageGroupOf(p, kind),
      indexable,
      title_length: p.title ? tl : known ? 0 : null,
      description_length: known ? dl : null,
      h1_count: p.h1Count ?? null,
      canonical,
      variant_url: variant,
      images_without_alt: p.imagesNoAlt ?? null,
      open_graph_missing: og,
      needs,
    };
  });
}

const WHY: Record<CleanupItem, string> = {
  canonical: 'Tells Google which address is the real one, so copies and filtered versions do not compete with it.',
  meta_title: 'The title is the blue link in Google; a clear, unique one gets more clicks.',
  meta_description: 'The description is the text under the link in Google; a good one gets more clicks.',
  h1: 'Each page needs exactly one main heading that says what the page is about.',
  alt_text: 'Alt text describes images for Google and for people who cannot see them.',
  schema: 'Schema tells Google and AI assistants who the business is and where each page sits on the site.',
  open_graph: 'Open Graph tags control how the page looks when it is shared on social media and in chat apps.',
};
const CHANGE: Record<CleanupItem, string> = {
  canonical: 'Indexable pages get a canonical tag pointing to themselves; variant, filter, tag, pagination and nested product addresses point to the clean address.',
  meta_title: 'Write a unique title of 50–60 characters for each page, with its main keyword near the start.',
  meta_description: 'Write a unique description of 140–160 characters for each page, with a benefit and a call to action.',
  h1: 'Give each page exactly one H1 that matches its main keyword.',
  alt_text: 'Add a short description to every content image that has no alt text.',
  schema: 'Add Organization and WebSite schema to the homepage and BreadcrumbList schema to every other page (JSON-LD through an app embed or plugin).',
  open_graph: 'Add og:title, og:description and og:image to every page that is missing them.',
};
const CHECK: Record<CleanupItem, string> = {
  canonical: 'The next audit shows no missing or wrong canonical tags in this group.',
  meta_title: 'The next audit shows no missing, duplicate or badly sized titles in this group.',
  meta_description: 'The next audit shows no missing or duplicate meta descriptions in this group.',
  h1: 'The next audit shows exactly one H1 on every page in this group.',
  alt_text: 'The next audit shows no content images without alt text in this group.',
  schema: 'Google’s Rich Results Test reads the schema on these pages without errors.',
  open_graph: 'Every page in this group shows a title, description and image when shared.',
};

/** A clean-up task the model left out, made from the crawl (rule 20). */
export function cleanupTask(item: CleanupItem, group: Exclude<PageGroup, 'none'>, urls: string[]): AiPlanTask {
  return {
    id: `1.cleanup-${item}-${group}`,
    week: CLEANUP_WEEK[item],
    title: `${ITEM_LABEL[item]}: fix ${urls.length} ${GROUP_LABEL[group]}`,
    why: WHY[item],
    urls,
    keywords: [],
    change: CHANGE[item],
    category: item === 'canonical' || item === 'schema' ? 'technical' : 'on_page',
    doer: CLEANUP_DOER[item],
    impact: item === 'canonical' || item === 'meta_title' ? 4 : 3,
    confidence: 4,
    effort: 2,
    priority: 0,
    depends_on: [],
    success_check: CHECK[item],
    check_after_days: 14,
    site_wide_item: item,
    page_group: group,
    area: '',
    issue_ids: [],
    recurring: false,
  };
}

/** Rule 23: the ongoing weekly check, when the model left it out. */
export const weeklyCheckTask = (): AiPlanTask => ({
  id: '1.weekly-check',
  week: 4,
  title: 'Check new and changed pages every week',
  why: 'New pages and edits can bring back missing titles, canonicals or alt text; catching them each week keeps the site clean.',
  urls: [],
  keywords: [],
  change: 'Every week, check pages that are new or changed and apply the same rules: canonical, title, description, H1, alt text and Open Graph tags.',
  category: 'on_page',
  doer: 'automatic',
  impact: 3,
  confidence: 4,
  effort: 1,
  priority: 0,
  depends_on: [],
  success_check: 'Each weekly check finds no new page without a canonical, title, description, H1, alt text or Open Graph tags.',
  check_after_days: 7,
  site_wide_item: 'weekly_check',
  page_group: 'none',
  area: 'A',
  issue_ids: [],
  recurring: true,
});

/** Title, description, H1, canonical or redirect changes always need the client's approval (rule 22). */
export const NEEDS_APPROVAL = /\b(titles?|meta descriptions?|h1s?|main headings?|canonicals?|redirects?|merge)\b/i;
