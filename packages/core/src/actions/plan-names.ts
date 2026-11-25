import type { ReportPage } from '../types';
import type { ActionItem, ActionWorkspace, PlanPageRow } from './actions';
import type { BusinessKind } from './ai-plan';
import { missingSchema, type CleanupItem, type CleanupPage } from './cleanup';

/**
 * Bug 8 (2026-11-25): owners could not tell which pages a task touches. Task titles now name the pages
 * (up to 4: "New titles for About Us and Contact"), or an owner-friendly group and a count ("New titles
 * for 54 product pages"), every page is listed with its before and after inside the task, and the
 * internal group names (money pages, main pages, other pages, information pages) never reach the screen.
 */
export const OWNER_GROUPS = ['Homepage', 'Shop categories', 'Product pages', 'Company pages', 'Policy pages', 'Blog posts'] as const;
export type OwnerGroup = (typeof OWNER_GROUPS)[number];
/** How a group reads after a count: "54 product pages", "3 shop categories". */
const COUNTED: Record<OwnerGroup, [string, string]> = {
  Homepage: ['homepage', 'homepages'], 'Shop categories': ['shop category', 'shop categories'], 'Product pages': ['product page', 'product pages'],
  'Company pages': ['company page', 'company pages'], 'Policy pages': ['policy page', 'policy pages'], 'Blog posts': ['blog post', 'blog posts'],
};

/** Internal group names that must never appear in text an owner reads. */
export const INTERNAL_GROUP_TERMS = /\b(information|info|money|main|other)[- _]pages?\b|\bmoney_pages\b/i;

const pathOf = (u: string) => {
  try {
    return new URL(u).pathname.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
};
const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();

type PageLike = Pick<ReportPage, 'url' | 'pageType'> & Partial<Pick<ReportPage, 'schemaTypes'>>;
export function ownerGroupOf(p: PageLike, kind: BusinessKind = 'mixed'): OwnerGroup {
  const path = pathOf(p.url);
  const schema = p.schemaTypes ?? [];
  if (p.pageType === 'home' || path === '/' || path === '') return 'Homepage';
  if (p.pageType === 'legal' || /\/(policies|policy|privacy|terms|cookies?|refund|returns?|shipping|delivery-policy|legal|gdpr|disclaimer)\b/.test(path)) return 'Policy pages';
  if (/\/products?\//.test(path) || schema.includes('Product')) return 'Product pages';
  if (/\/(collections?|product-category|shop|categor(y|ies))\//.test(path) || (kind === 'ecommerce' && p.pageType === 'category')) return 'Shop categories';
  if (p.pageType === 'blog_post' || p.pageType === 'blog_index' || /\/(blogs?|news|articles?|guides?)\//.test(path)) return 'Blog posts';
  return 'Company pages';
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The page's own name on the site: its title without the shop name, else its H1, else its address. */
export function pageNameOf(p: Pick<ReportPage, 'url'> & Partial<Pick<ReportPage, 'title' | 'h1' | 'pageType'>>, suffix?: string | null): string {
  const path = pathOf(p.url);
  if (p.pageType === 'home' || path === '/' || path === '') return 'Homepage';
  let t = (p.title ?? '').trim();
  if (suffix && t.endsWith(suffix.trim())) t = t.slice(0, t.length - suffix.trim().length).trim();
  t = t.split(/\s[|–—]\s|\s-\s/)[0]!.trim();
  if (t.length < 3 || t.length > 60) t = (p.h1 ?? '').trim();
  if (t.length < 3 || t.length > 60) {
    const slug = path.split('/').filter(Boolean).pop() ?? '';
    t = titleCase(decodeURIComponent(slug).replace(/\.\w+$/, '').replace(/[-_]+/g, ' ').trim()) || p.url;
  }
  return t.replace(/&amp;/g, '&');
}

/** Internal group words → words an owner understands (for text the model wrote). */
export function ownerText(s: string): string {
  return s
    .replace(/\bmoney_pages\b/gi, 'key pages')
    .replace(/\b(information|info)[- _](pages?)\b/gi, 'company $2')
    .replace(/\b(money|main)[- _](pages?)\b/gi, 'key $2')
    .replace(/\b(\d+) other[- _]pages?\b/gi, (_m, n: string) => `${n} more ${n === '1' ? 'page' : 'pages'}`)
    .replace(/\b(the |your |all )?other[- _]pages\b/gi, 'the rest of the site')
    .replace(/\bother[- _]page\b/gi, 'another page');
}

const VERB: Record<CleanupItem, string> = {
  meta_title: 'New titles for', meta_description: 'New meta descriptions for', h1: 'One main heading (H1) on', canonical: 'Canonical tags on',
  alt_text: 'Image alt text on', schema: 'Schema markup on', open_graph: 'Link previews (Open Graph) for',
};
const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** "the Homepage, About Us and Contact" (≤ 4 pages) or "54 product pages" / "60 pages". */
export function pagesPhrase(pages: { name: string; group: OwnerGroup }[]): string {
  if (pages.length && pages.length <= 4) return list([...new Set(pages.map((p) => (p.name === 'Homepage' ? 'the homepage' : p.name)))]);
  const groups = new Set(pages.map((p) => p.group));
  const n = pages.length;
  if (groups.size === 1) {
    const [one, many] = COUNTED[[...groups][0]!];
    return `${n} ${n === 1 ? one : many}`;
  }
  return `${n} pages`;
}
export const siteWideTitle = (item: CleanupItem, pages: { name: string; group: OwnerGroup }[]) => `${VERB[item]} ${pagesPhrase(pages)}`;
/** "Product pages" for one group, else "Homepage, Company pages" (chip on the task). */
export const groupsLabel = (pages: { group: OwnerGroup }[]) => [...new Set(pages.map((p) => p.group))].sort((a, b) => OWNER_GROUPS.indexOf(a) - OWNER_GROUPS.indexOf(b)).join(', ');

/** Before and after of one page for one clean-up item. */
function beforeAfter(item: CleanupItem, raw: ReportPage | undefined, c: CleanupPage | undefined, change: { now: string; suggested: string } | undefined): [string, string] {
  if (change) return [change.now, change.suggested];
  switch (item) {
    case 'meta_title': return [raw?.title ? `“${raw.title}” (${raw.title.length} characters)` : 'No title', 'A unique title of 50–60 characters'];
    case 'meta_description': return [raw?.description ? `“${raw.description}” (${raw.description.length} characters)` : 'No meta description', 'A unique description of 140–155 characters'];
    case 'h1': return [raw?.h1Count === 0 ? 'No H1' : raw?.h1Count !== undefined ? `${raw.h1Count} H1s` : 'Not checked yet', 'Exactly one H1'];
    case 'canonical':
      if (c?.variant_url) return ['Variant or filtered address', 'Canonical tag pointing to the main address'];
      return [c?.canonical === 'missing' ? 'No canonical tag' : c?.canonical === 'other' ? 'Canonical points to another address' : 'Not checked yet', 'Canonical tag pointing to itself'];
    case 'alt_text': return [c?.images_without_alt ? `${c.images_without_alt} image(s) without alt text` : 'Not checked yet', 'Alt text on every content image'];
    case 'schema': {
      const missing = raw ? missingSchema({ url: raw.url, pageType: raw.pageType, schemaTypes: raw.schemaTypes }) : [];
      return [missing.length ? `Missing ${missing.join(', ')}` : 'Not checked yet', missing.length ? `Has ${missing.join(', ')}` : 'Schema checked'];
    }
    case 'open_graph': return [c?.open_graph_missing?.length ? `Missing ${c.open_graph_missing.join(', ')}` : 'Not checked yet', 'og:title, og:description and og:image'];
  }
}

/**
 * In place, on the actions of the plan just written: site-wide batches get a title naming their pages
 * and the list of every page with before/after; model-written titles with up to 4 pages have addresses
 * replaced by page names; all task text loses the internal group names.
 */
export function namePlanActions(ws: ActionWorkspace, ctx: { report?: { pages?: ReportPage[] } | null; pages: CleanupPage[]; kind: BusinessKind; suffix?: string | null }): void {
  const planId = ws.aiPlan?.id;
  const raw = new Map((ctx.report?.pages ?? []).map((p) => [norm(p.url), p]));
  const clean = new Map(ctx.pages.map((p) => [norm(p.url), p]));
  const info = (u: string) => {
    const r = raw.get(norm(u));
    return { name: pageNameOf(r ?? { url: u }, ctx.suffix), group: ownerGroupOf(r ?? { url: u, pageType: null }, ctx.kind) };
  };
  for (const a of ws.actions) {
    if (a.source.kind !== 'ai' || a.source.planId !== planId || !a.plan) continue;
    const item = a.plan.siteWideItem;
    if (item && item !== 'weekly_check' && item !== 'none' && a.urls.length) {
      const pages = a.urls.map(info);
      a.title = siteWideTitle(item, pages);
      a.plan.groupLabel = groupsLabel(pages);
      const byUrl = new Map((a.changes ?? []).filter((c) => typeof c.data?.url === 'string').map((c) => [norm(c.data!.url as string), c]));
      a.plan.pages = a.urls.map((u, i): PlanPageRow => {
        const [before, after] = beforeAfter(item, raw.get(norm(u)), clean.get(norm(u)), byUrl.get(norm(u)));
        return { url: u, name: pages[i]!.name, before, after };
      });
      for (const c of a.changes ?? []) {
        if (typeof c.data?.url === 'string') c.label = `${c.id === 'title' ? 'Title tag' : c.id === 'meta' ? 'Meta description' : c.label.split(' · ')[0]} · ${info(c.data.url).name}`;
      }
    } else if (a.urls.length && a.urls.length <= 4) {
      for (const u of a.urls) {
        const name = info(u).name;
        for (const form of [u, u.replace(/^https?:\/\/[^/]+/i, '')].filter((f) => f.length > 1)) a.title = a.title.split(form).join(name);
      }
    }
    a.title = ownerText(a.title);
    a.detail = ownerText(a.detail);
    a.plan.why = ownerText(a.plan.why);
    a.plan.change = ownerText(a.plan.change);
    a.plan.successCheck = ownerText(a.plan.successCheck);
  }
  if (ws.aiPlan) {
    ws.aiPlan.summary = ownerText(ws.aiPlan.summary);
    ws.aiPlan.months = ws.aiPlan.months.map((m) => ({ ...m, theme: ownerText(m.theme), goal: ownerText(m.goal) }));
  }
}

/** Every piece of an action an owner reads (for checks and tests). */
export const actionTexts = (a: ActionItem): string[] => [
  a.title, a.detail, a.plan?.why ?? '', a.plan?.change ?? '', a.plan?.successCheck ?? '', a.plan?.groupLabel ?? '',
  ...(a.plan?.pages ?? []).flatMap((p) => [p.name, p.before, p.after]), ...(a.changes ?? []).map((c) => c.label),
];
