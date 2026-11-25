import type { WordPressClient, WpInventoryItem, WpStatus } from '../providers/wordpress';

/**
 * The site's own list of everything it publishes (pages, posts, products, categories), read from the
 * MS SCORE Connector plugin. It is the source of truth for planning changes and for "before" values,
 * refreshed weekly. Keyed by account and domain.
 */
export type InventoryImage = { id: number | null; url: string; alt: string | null; featured: boolean };

export type InventoryItem = {
  id: number;
  url: string | null;
  /** page, post, product, category, product_cat… */
  type: string;
  name: string;
  /** The title tag as the SEO plugin stores it with its variables filled in, when it can tell. */
  titleTag: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
  canonical: string | null;
  noindex: boolean;
  nofollow: boolean;
  /** H1s written in the content (an H1 the theme prints around the title is read from the live page). */
  h1s: string[];
  images: InventoryImage[];
  wordCount: number;
  schemaTypes: string[];
  /** elementor, gutenberg, classic, divi (null for categories). */
  builder: string | null;
  isFrontPage: boolean;
  modified: string | null;
};

export type SiteInventory = {
  accountId: string;
  domain: string;
  platform: 'wordpress';
  refreshedAt: string;
  /** What the site runs (plugin GET /status). */
  status: WpStatus;
  items: InventoryItem[];
  /** Items per content type, as the site reported them. */
  totals: Record<string, number>;
  /** True when the site has more than we read (MAX_INVENTORY_ITEMS). */
  truncated: boolean;
  /** Types that could not be read, with the reason. */
  errors: string[];
};

/** At most this many items are kept per site. */
export const MAX_INVENTORY_ITEMS = 5_000;
/** The inventory is read again after this long. */
export const INVENTORY_MAX_AGE_DAYS = 7;
const PER_PAGE = 100;

export function toInventoryItem(i: WpInventoryItem): InventoryItem {
  return {
    id: i.id,
    url: i.url,
    type: i.type,
    name: i.name,
    titleTag: i.title_tag,
    seoTitle: i.seo_title,
    metaDescription: i.meta_description,
    canonical: i.canonical,
    noindex: i.robots.noindex,
    nofollow: i.robots.nofollow,
    h1s: i.h1s,
    images: i.images.map((m) => ({ id: m.id, url: m.url, alt: m.alt, featured: m.featured })),
    wordCount: i.word_count,
    schemaTypes: i.schema_types,
    builder: i.builder,
    isFrontPage: i.is_front_page,
    modified: i.modified,
  };
}

/**
 * Reads the whole inventory, one type and one page at a time (one request in flight, so the site
 * is never flooded). A type that fails is noted and the others are still read.
 */
export async function collectInventory(
  wp: Pick<WordPressClient, 'status' | 'inventory'>,
  ctx: { accountId: string; domain: string; now?: Date; maxItems?: number },
): Promise<SiteInventory> {
  const status = await wp.status();
  const max = ctx.maxItems ?? MAX_INVENTORY_ITEMS;
  const items: InventoryItem[] = [];
  const totals: Record<string, number> = {};
  const errors: string[] = [];
  let truncated = false;
  for (const type of status.inventory_types) {
    let page = 1;
    let pages = 1;
    do {
      if (items.length >= max) {
        truncated = true;
        break;
      }
      try {
        const r = await wp.inventory(type, page, PER_PAGE);
        totals[type] = r.total;
        pages = r.total_pages;
        const room = max - items.length;
        if (r.items.length > room) truncated = true;
        items.push(...r.items.slice(0, room).map(toInventoryItem));
      } catch (err) {
        errors.push(`${type}: ${err instanceof Error ? err.message.slice(0, 160) : 'could not be read'}`);
        break;
      }
      page++;
    } while (page <= pages);
  }
  return { accountId: ctx.accountId, domain: ctx.domain, platform: 'wordpress', refreshedAt: (ctx.now ?? new Date()).toISOString(), status, items, totals, truncated, errors };
}

/** Whether the saved inventory should be read again. */
export function inventoryDue(inv: Pick<SiteInventory, 'refreshedAt'> | null, now = new Date()): boolean {
  if (!inv) return true;
  return now.getTime() - new Date(inv.refreshedAt).getTime() > INVENTORY_MAX_AGE_DAYS * 86_400_000;
}

/** Plain-language numbers for the connection card. */
export function inventorySummary(inv: SiteInventory): {
  total: number;
  byType: { type: string; count: number }[];
  missingTitle: number;
  missingDescription: number;
  imagesWithoutAlt: number;
  noindex: number;
} {
  const byType = new Map<string, number>();
  let missingTitle = 0;
  let missingDescription = 0;
  let imagesWithoutAlt = 0;
  let noindex = 0;
  for (const i of inv.items) {
    byType.set(i.type, (byType.get(i.type) ?? 0) + 1);
    if (!i.seoTitle) missingTitle++;
    if (!i.metaDescription) missingDescription++;
    if (i.noindex) noindex++;
    imagesWithoutAlt += i.images.filter((m) => m.alt === null || m.alt.trim() === '').length;
  }
  return { total: inv.items.length, byType: [...byType].map(([type, count]) => ({ type, count })), missingTitle, missingDescription, imagesWithoutAlt, noindex };
}

/**
 * Findings a person must hear about at once (spec: "Discourage search engines" on a live site is
 * critical).
 */
export function statusAlerts(s: WpStatus): { level: 'critical' | 'warning'; message: string }[] {
  const out: { level: 'critical' | 'warning'; message: string }[] = [];
  if (!s.search_visible) out.push({ level: 'critical', message: 'WordPress is set to “Discourage search engines from indexing this site” (Settings → Reading), so Google is asked not to show it.' });
  if (s.seo_plugin === 'none' && !s.theme.title_tag) out.push({ level: 'warning', message: 'The theme writes its own <title> tag, so new titles may need a small theme change.' });
  return out;
}
