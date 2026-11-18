import type { PageContent } from '../audit/page-content';
import { PRICE, REVIEWS, schemaValues, TRUST } from '../audit/content-signals';
import { classifyPage } from '../audit/templates';
import { normTerm } from '../keywords/clean';
import type { RankedKeyword } from '../providers/dataforseo-keywords';

/**
 * Module 6 details from pages we already fetch (free): page type and format, title and H1, images
 * and video, trust signals and prices, calls to action and forms, freshness (6.2), missing topics
 * (6.2.4), site structure from the sitemap (6.3.3, 6.3.4), the competitors' top pages (6.1.3) and the
 * answer formats ChatGPT used (6.6.3).
 */
export const PAGE_KIND: Record<string, string> = {
  home: 'Homepage', service: 'Service page', location: 'Location page', service_location: 'Service + area page', blog_post: 'Article', blog_index: 'Blog list',
  category: 'Category page', contact: 'Contact page', about: 'About page', legal: 'Legal page', other: 'Other page',
};

export type PageDetails = {
  title: string | null;
  h1: string | null;
  pageType: string;
  images: number;
  videos: number;
  forms: number;
  callButtons: number;
  trust: string[];
  price: boolean;
  /** Last updated (from schema) or the latest year mentioned on the page. */
  updated: string | null;
};

export function pageDetails(c: PageContent, now = new Date()): PageDetails {
  const trust = [
    REVIEWS.test(c.fullText) || c.schemaTypes.some((t) => /Review|AggregateRating/.test(t)) ? 'Reviews' : '',
    TRUST.test(c.fullText) ? 'Licences or guarantees' : '',
  ].filter(Boolean);
  return {
    title: c.title ?? null,
    h1: c.h1[0] ?? null,
    pageType: PAGE_KIND[classifyPage(c.url, c)] ?? 'Page',
    images: c.images.length,
    videos: c.videos,
    forms: c.forms.length,
    callButtons: c.telLinks,
    trust,
    price: PRICE.test(c.text),
    updated: freshness(c, now),
  };
}

/** 6.2.9 dateModified / datePublished from the page's schema, else the latest year mentioned in the text. */
export function freshness(c: PageContent, now = new Date()): string | null {
  const dates = [...schemaValues(c, 'dateModified'), ...schemaValues(c, 'datePublished')].map((d) => d.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (dates.length) return dates[dates.length - 1]!;
  const year = now.getUTCFullYear();
  const years = [...c.text.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1])).filter((y) => y <= year && y >= year - 15);
  return years.length ? String(Math.max(...years)) : null;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'your', 'our', 'you', 'what', 'how', 'why', 'when', 'who', 'are', 'can', 'does', 'from', 'about', 'more', 'this', 'that', 'get', 'need', 'best', 'services', 'service']);
const words = (s: string) => normTerm(s).split(' ').filter((w) => w.length > 3 && !STOP.has(w));

/** 6.2.4 Sections (H2/H3) the competitor pages have and the client's page does not cover in its text. */
export function missingTopics(you: PageContent | null, rivals: PageContent[], limit = 6): string[] {
  const have = new Set(you ? words(`${you.text} ${you.headings.map((h) => h.text).join(' ')}`) : []);
  const seen = new Map<string, { text: string; count: number }>();
  for (const r of rivals) {
    for (const h of r.headings.filter((x) => x.level === 2 || x.level === 3)) {
      const w = words(h.text);
      if (!w.length || h.text.length > 80) continue;
      // Covered when most of its words already appear on the client's page.
      if (you && w.filter((x) => have.has(x)).length / w.length >= 0.6) continue;
      const key = w.slice().sort().join(' ');
      const e = seen.get(key) ?? { text: h.text.trim(), count: 0 };
      e.count++;
      seen.set(key, e);
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.text.length - b.text.length).slice(0, limit).map((x) => x.text);
}

/** 6.3.3 / 6.3.4 The biggest folders of a sitemap ("/services/ 24, /blog/ 120"). */
export function sitemapFolders(urls: string[], limit = 6): { folder: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const u of urls) {
    let path: string;
    try {
      path = new URL(u).pathname;
    } catch {
      continue;
    }
    const first = path.split('/').filter(Boolean)[0];
    const folder = first && path.split('/').filter(Boolean).length > 1 ? `/${first}/` : '/ (top level)';
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts].map(([folder, count]) => ({ folder, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

export type TopPage = { url: string; volume: number; keywords: string[] };

/** 6.1.3 A competitor's strongest pages: its ranked keywords grouped by page, by search volume. */
export function topPagesFrom(ranked: RankedKeyword[], limit = 5): TopPage[] {
  const by = new Map<string, TopPage>();
  for (const k of ranked) {
    if (!k.url || k.position === null || k.position > 20) continue;
    const p = by.get(k.url) ?? { url: k.url, volume: 0, keywords: [] };
    p.volume += k.volume ?? 0;
    if (p.keywords.length < 5) p.keywords.push(k.term);
    by.set(k.url, p);
  }
  return [...by.values()].sort((a, b) => b.volume - a.volume).slice(0, limit);
}

export type AnswerFormat = 'Numbered steps' | 'Bullet list' | 'Table' | 'Sections with headings' | 'Short answer' | 'Paragraphs';

/** 6.6.3 The shape of an AI answer (lists, steps, tables or prose). */
export function answerFormat(text: string): AnswerFormat {
  const lines = text.split('\n');
  if (lines.filter((l) => /^\s*\|.*\|\s*$/.test(l)).length >= 3) return 'Table';
  if (lines.filter((l) => /^\s*\d+[.)]\s/.test(l)).length >= 3) return 'Numbered steps';
  if (lines.filter((l) => /^\s*[-*•]\s/.test(l)).length >= 3) return 'Bullet list';
  if (lines.filter((l) => /^\s*#{1,4}\s/.test(l) || /^\s*\*\*[^*]{3,60}\*\*\s*$/.test(l)).length >= 2) return 'Sections with headings';
  return text.split(/\s+/).filter(Boolean).length <= 120 ? 'Short answer' : 'Paragraphs';
}
