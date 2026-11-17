import { normTerm } from '../keywords/clean';
import type { ClusterPageType, KeywordCluster, KeywordRecord } from '../keywords/types';
import type { KeywordIntent } from '../providers/dataforseo-keywords';
import type { ReportPage } from '../types';

/**
 * Module 5 · Keyword to page mapping (spec §16.2). One workspace per website, rebuilt from the
 * Module 4 topics, the latest audit's pages (5.1) and Search Console (when connected). Hand-made
 * choices (page, action, drafts, owner, status) survive a rebuild.
 */
export type MappingAction = 'optimise' | 'expand' | 'merge' | 'create' | 'leave';
export type MappingStatus = 'todo' | 'in_progress' | 'live' | 'verified';
export type Drafts = { title: string; h1: string; meta: string; source: 'template' | 'ai'; approved: boolean };

export type MappingRow = {
  clusterId: string;
  topic: string;
  intent: KeywordIntent | null;
  /** Module 4 priority (business value × chance, 1–25). */
  priority: number;
  volume: number;
  /** 5.2 the page that should rank (null = 5.3 new page needed). */
  url: string | null;
  urlLocked: boolean;
  /** Why this page: "gets 34 clicks for these searches", "title matches", … */
  reason: string;
  action: MappingAction;
  actionLocked: boolean;
  newPageType: ClusterPageType | null;
  primaryKeyword: string;
  secondaryKeywords: string[];
  currentPosition: number | null;
  targetPosition: number;
  /** 5.4 other pages getting a share of this topic's clicks (or impressions). */
  conflicts: { url: string; share: number }[];
  drafts: Drafts | null;
  linksToAdd: { from: string; anchor: string }[];
  schemaNeeded: string[];
  owner: string | null;
  status: MappingStatus;
  updatedAt: string;
};

export type MappingWorkspace = {
  domain: string;
  builtAt: string | null;
  /** The audit whose pages were used. */
  auditId: string | null;
  usedSearchConsole: boolean;
  rows: MappingRow[];
};

export type MappingQuery = { query: string; page: string; clicks: number; impressions: number; position: number };

export const MAX_MAPPING_ROWS = 40;
export const emptyMapping = (domain: string): MappingWorkspace => ({ domain, builtAt: null, auditId: null, usedSearchConsole: false, rows: [] });

export const normUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
const STOP = new Set(['a', 'an', 'and', 'the', 'for', 'in', 'of', 'to', 'near', 'me', 'my', 'best', 'top', 'cost', 'price', 'company', 'services', 'service']);
const tokens = (s: string) => normTerm(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w)).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));

/** Share of the topic's words found in the page's title, H1 and address (0–1). */
function textMatch(head: string, p: ReportPage): number {
  const want = [...new Set(tokens(head))];
  if (!want.length) return 0;
  const have = new Set(tokens(`${p.title ?? ''} ${p.h1 ?? ''} ${decodeURIComponent(new URL(p.url).pathname).replace(/[-_/]+/g, ' ')}`));
  return want.filter((w) => have.has(w)).length / want.length;
}

/** Abbreviations that stay in capitals in titles ("AC Repair", not "Ac Repair"). */
const ACRONYMS = new Set(['ac', 'hvac', 'uk', 'usa', 'diy', 'tv', 'led', 'seo', 'ppc', 'ev', 'uae', 'nyc']);
const titleCase = (s: string) =>
  s
    .split(' ')
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.replace(/^\p{L}/u, (c) => c.toUpperCase())))
    .join(' ');

/** 5.11 schema each page type should carry (rule 1.11.1 expectations), minus what the page has. */
export function schemaFor(pageType: string | null, has: string[], faq: boolean): string[] {
  const t = pageType ?? 'service';
  const want =
    t === 'home' ? ['Organization or LocalBusiness']
    : t === 'service' ? ['Service', ...(faq ? ['FAQPage'] : [])]
    : t === 'location' || t === 'service_location' ? ['LocalBusiness', 'Service']
    : t === 'blog_post' ? ['Article']
    : t === 'product' ? ['Product']
    : t === 'category' ? ['ItemList']
    : [];
  if (t !== 'home') want.push('BreadcrumbList');
  const owned = new Set(has);
  const local = has.some((x) => /LocalBusiness|Business$|Contractor|Plumber|Electrician|Store$/.test(x));
  return want.filter((w) => {
    if (w === 'Organization or LocalBusiness') return !(owned.has('Organization') || local);
    if (w === 'LocalBusiness') return !local;
    return !owned.has(w);
  });
}

/** Template drafts for 5.8 (AI can replace them on request). */
export function templateDrafts(primary: string, brand: string, place: string | null): Drafts {
  const kw = titleCase(primary);
  const withPlace = place && !normTerm(primary).includes(normTerm(place)) ? `${kw} in ${titleCase(place)}` : kw;
  const title = `${withPlace} | ${brand}`.length <= 60 ? `${withPlace} | ${brand}` : withPlace.slice(0, 60);
  return {
    title,
    h1: withPlace,
    meta: `${withPlace} from ${brand}. Clear prices, trusted local experts and fast help when you need it. Get a free quote today.`.slice(0, 160),
    source: 'template',
    approved: false,
  };
}

const target = (pos: number | null) => (pos === null ? 10 : pos <= 3 ? Math.max(1, Math.round(pos)) : pos <= 10 ? 3 : 10);

/** 5.1–5.13: one row per topic (highest priority first), the best page, the action and what to change. */
export function buildMapping(input: {
  domain: string;
  clusters: KeywordCluster[];
  keywords: KeywordRecord[];
  pages: ReportPage[];
  gsc?: MappingQuery[];
  questions?: { keyword: string }[];
  previous?: MappingWorkspace | null;
  brand: string;
  place?: string | null;
  auditId?: string | null;
  now?: Date;
}): MappingWorkspace {
  const now = (input.now ?? new Date()).toISOString();
  const prev = new Map((input.previous?.rows ?? []).map((r) => [r.clusterId, r]));
  const pageBy = new Map(input.pages.map((p) => [normUrl(p.url), p]));
  const home = input.pages.find((p) => new URL(p.url).pathname.replace(/\/$/, '') === '');
  const gscBy = new Map<string, MappingQuery[]>();
  for (const q of input.gsc ?? []) gscBy.set(normTerm(q.query), [...(gscBy.get(normTerm(q.query)) ?? []), q]);
  const questionTerms = new Set((input.questions ?? []).map((q) => q.keyword));
  const used = new Set<string>();

  const rows = [...input.clusters]
    .sort((a, b) => b.priority - a.priority || b.volume - a.volume)
    .slice(0, MAX_MAPPING_ROWS)
    .map((c): MappingRow => {
      const old = prev.get(c.id);
      const members = input.keywords.filter((k) => k.clusterId === c.id && k.status === 'kept').sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
      const terms = new Set([c.head, ...members.map((m) => m.term)].map(normTerm));

      // Evidence per page: Search Console clicks/impressions for the topic's searches, then known rankings.
      const ev = new Map<string, { url: string; clicks: number; impressions: number; posSum: number }>();
      for (const t of terms) {
        for (const q of gscBy.get(t) ?? []) {
          const key = normUrl(q.page);
          const e = ev.get(key) ?? { url: q.page, clicks: 0, impressions: 0, posSum: 0 };
          e.clicks += q.clicks;
          e.impressions += q.impressions;
          e.posSum += q.position * q.impressions;
          ev.set(key, e);
        }
      }
      const evidence = [...ev.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
      const ranked = members.filter((m) => m.url && m.position !== null).sort((a, b) => a.position! - b.position!);
      const matched = input.pages
        .map((p) => ({ p, score: textMatch(c.head, p) + (p.pageType && p.pageType === c.pageType ? 0.2 : 0) }))
        .filter((m) => m.score >= 0.6)
        .sort((a, b) => b.score - a.score || a.p.url.length - b.p.url.length);

      let url: string | null = null;
      let reason = '';
      if (old?.urlLocked) [url, reason] = [old.url, 'Chosen by hand'];
      else if (evidence[0] && (evidence[0].clicks > 0 || evidence[0].impressions > 0)) {
        url = evidence[0].url;
        reason = evidence[0].clicks > 0 ? `Gets ${evidence[0].clicks} clicks from Google for these searches` : `Shown ${evidence[0].impressions} times in Google for these searches`;
      } else if (ranked[0]?.url) [url, reason] = [ranked[0].url, `Already ranks #${ranked[0].position} for "${ranked[0].term}"`];
      else if (matched[0]) [url, reason] = [matched[0].p.url, 'Title, heading or address matches this topic'];
      else reason = 'No page targets this topic yet';

      const key = url ? normUrl(url) : null;
      const page = key ? pageBy.get(key) ?? null : null;
      const e = key ? ev.get(key) : undefined;
      const totalClicks = evidence.reduce((s, x) => s + x.clicks, 0);
      const totalImpr = evidence.reduce((s, x) => s + x.impressions, 0);
      const conflicts = evidence
        .filter((x) => normUrl(x.url) !== key)
        .map((x) => ({ url: x.url, share: totalClicks > 0 ? x.clicks / totalClicks : totalImpr > 0 ? x.impressions / totalImpr : 0 }))
        .filter((x) => x.share >= 0.2)
        .map((x) => ({ ...x, share: Math.round(x.share * 100) / 100 }));
      const currentPosition = e && e.impressions ? Math.round((e.posSum / e.impressions) * 10) / 10 : (ranked.find((r) => key && r.url && normUrl(r.url) === key)?.position ?? null);
      const typeMismatch = Boolean(page?.pageType && c.pageType && !['directory', 'home'].includes(c.pageType) && page.pageType !== c.pageType && !(c.pageType === 'service_location' && ['service', 'location'].includes(page.pageType)));

      let action: MappingAction;
      if (!url) action = 'create';
      else if (conflicts.length) action = 'merge';
      else if (currentPosition !== null && currentPosition <= 3) action = 'leave';
      else if ((page && page.words < 300) || typeMismatch) action = 'expand';
      else action = 'optimise';
      if (old?.actionLocked) action = old.action;
      if (url) used.add(normUrl(url));

      // 5.10 relevant pages that do not link to the target yet (for a new page: where to link from once it exists).
      const head = tokens(c.head);
      const linksToAdd = input.pages
        .filter((p) => !key || normUrl(p.url) !== key)
        .filter((p) => !key || !p.links.some((l) => normUrl(l) === key))
        .map((p) => ({ p, rel: head.filter((w) => tokens(`${p.title ?? ''} ${p.h1 ?? ''} ${p.url}`).includes(w)).length + (p === home ? 0.5 : 0) }))
        // Relevant = shares at least half of the topic's words (one shared word like "repair" is not enough).
        .filter((x) => x.rel >= Math.max(1, Math.ceil(head.length / 2)))
        .sort((a, b) => b.rel - a.rel || a.p.url.length - b.p.url.length)
        .slice(0, 5)
        .map((x) => ({ from: x.p.url, anchor: c.head }));

      const secondary = members.map((m) => m.term).filter((t) => t !== c.head).slice(0, 5);
      const faq = [...terms].some((t) => questionTerms.has(t));
      return {
        clusterId: c.id,
        topic: c.name,
        intent: c.intent,
        priority: c.priority,
        volume: c.volume,
        url,
        urlLocked: old?.urlLocked ?? false,
        reason,
        action,
        actionLocked: old?.actionLocked ?? false,
        newPageType: url ? null : c.pageType,
        primaryKeyword: c.head,
        secondaryKeywords: secondary,
        currentPosition,
        targetPosition: target(currentPosition),
        conflicts,
        drafts: old?.drafts ?? templateDrafts(c.head, input.brand, input.place ?? null),
        linksToAdd,
        schemaNeeded: schemaFor(url ? page?.pageType ?? null : c.pageType, page?.schemaTypes ?? [], faq),
        owner: old?.owner ?? null,
        status: old?.status ?? 'todo',
        updatedAt: old && old.url === url && old.action === action ? old.updatedAt : now,
      };
    });

  return { domain: input.domain, builtAt: now, auditId: input.auditId ?? null, usedSearchConsole: Boolean(input.gsc?.length), rows };
}

/** 5.1 page inventory: every audited page with the topics mapped to it (pages without one are candidates for new topics). */
export function pageInventory(ws: MappingWorkspace, pages: ReportPage[]): { url: string; title: string | null; words: number; pageType: string | null; topics: string[] }[] {
  const topics = new Map<string, string[]>();
  for (const r of ws.rows) if (r.url) topics.set(normUrl(r.url), [...(topics.get(normUrl(r.url)) ?? []), r.topic]);
  return pages.map((p) => ({ url: p.url, title: p.title, words: p.words, pageType: p.pageType, topics: topics.get(normUrl(p.url)) ?? [] }));
}

/** Hand edits for one row (5.9 action, 5.2 page, 5.12–5.13 owner and status, 5.8 drafts). */
export function updateMappingRow(
  ws: MappingWorkspace,
  clusterId: string,
  patch: Partial<Pick<MappingRow, 'action' | 'url' | 'owner' | 'status'>> & { drafts?: Partial<Omit<Drafts, 'source'>> & { source?: Drafts['source'] } },
  now = new Date(),
): MappingWorkspace {
  return {
    ...ws,
    rows: ws.rows.map((r) => {
      if (r.clusterId !== clusterId) return r;
      const next: MappingRow = { ...r, updatedAt: now.toISOString() };
      if (patch.action && patch.action !== r.action) Object.assign(next, { action: patch.action, actionLocked: true });
      if (patch.url !== undefined && patch.url !== r.url) Object.assign(next, { url: patch.url, urlLocked: true, reason: 'Chosen by hand', newPageType: patch.url ? null : r.newPageType });
      if (patch.owner !== undefined) next.owner = patch.owner?.trim().slice(0, 80) || null;
      if (patch.status) next.status = patch.status;
      if (patch.drafts) {
        const base = r.drafts ?? { title: '', h1: '', meta: '', source: 'template' as const, approved: false };
        next.drafts = {
          title: (patch.drafts.title ?? base.title).slice(0, 120),
          h1: (patch.drafts.h1 ?? base.h1).slice(0, 120),
          meta: (patch.drafts.meta ?? base.meta).slice(0, 320),
          source: patch.drafts.source ?? base.source,
          approved: patch.drafts.approved ?? base.approved,
        };
      }
      return next;
    }),
  };
}

/**
 * Feeds Module 2: the primary keyword of every mapped page, so rules 2.1.4, 2.2.4, 2.3.2 and
 * 2.4.3 check the keyword the page is meant to rank for instead of guessing from its address.
 */
export function pageKeywordMap(ws: MappingWorkspace | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of ws?.rows ?? []) if (r.url && r.action !== 'merge' && !out[normUrl(r.url)]) out[normUrl(r.url)] = r.primaryKeyword;
  return out;
}

const STATUS_ORDER: Record<MappingStatus, number> = { todo: 0, in_progress: 1, live: 2, verified: 3 };
export const mappingSummary = (ws: MappingWorkspace) => ({
  rows: ws.rows.length,
  newPages: ws.rows.filter((r) => r.action === 'create').length,
  conflicts: ws.rows.filter((r) => r.conflicts.length).length,
  done: ws.rows.filter((r) => STATUS_ORDER[r.status] >= 2).length,
});

/** CSV export of the page plan (one row per topic). */
export function mappingToCsv(ws: MappingWorkspace): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['priority', 'topic', 'page', 'action', 'new_page_type', 'primary_keyword', 'secondary_keywords', 'position', 'target', 'competing_pages', 'new_title', 'new_h1', 'new_meta', 'approved', 'links_to_add', 'schema_to_add', 'owner', 'status'];
  const rows = ws.rows.map((r) => [
    r.priority, r.topic, r.url ?? 'NEW PAGE NEEDED', r.action, r.newPageType, r.primaryKeyword, r.secondaryKeywords.join('; '), r.currentPosition, r.targetPosition,
    r.conflicts.map((c) => c.url).join(' '), r.drafts?.title, r.drafts?.h1, r.drafts?.meta, r.drafts?.approved ? 'yes' : 'no',
    r.linksToAdd.map((l) => `${l.from} → "${l.anchor}"`).join(' | '), r.schemaNeeded.join(', '), r.owner, r.status,
  ]);
  return `﻿${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
