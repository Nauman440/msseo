import { normTerm } from '../keywords/clean';
import type { ClusterPageType, KeywordCluster, KeywordRecord } from '../keywords/types';
import type { KeywordIntent } from '../providers/dataforseo-keywords';
import type { ReportPage } from '../types';

/**
 * Module 5 · Keyword to page mapping (spec §16.2). One workspace per website, rebuilt from the
 * Module 4 topics, the latest audit's pages (5.1), the sitemap and Search Console (when connected).
 * One topic gets one page and one page serves one topic. Hand-made choices (page, action, settled
 * conflicts, drafts, edits, owner, status, moved keywords) survive a rebuild.
 */
export type MappingAction = 'optimise' | 'expand' | 'merge' | 'create' | 'leave';
export type MappingStatus = 'todo' | 'in_progress' | 'live' | 'verified';
export type Drafts = { title: string; h1: string; meta: string; source: 'template' | 'ai'; approved: boolean };
/** How sure the match is: high = Google already shows the page for it, medium = the page's content matches, low = only its address (sitemap). */
export type MatchStrength = 'high' | 'medium' | 'low';
/** 5.4 What happens to the other page when two pages compete: give it another keyword, or merge it into the main page. */
export type ConflictPlan = 'differentiate' | 'merge';
export type Slot = 'title' | 'h1' | 'meta' | 'first' | 'heading' | 'body' | 'faq' | 'table';

/** What the live page contains (one-page keyword map), fetched on demand and kept for a few days. */
export type PageCheck = {
  url: string;
  fetchedAt: string;
  status: number;
  title: string | null;
  h1: string[];
  meta: string | null;
  headings: string[];
  firstParagraph: string | null;
  faq: boolean;
  tables: number;
  words: number;
  /** Where each of the topic's keywords was found when the page was checked (normalised term → slots). */
  found: Record<string, Slot[]>;
};

export type MappingRow = {
  clusterId: string;
  topic: string;
  intent: KeywordIntent | null;
  /** 5.6 Someone confirmed the search intent fits the page. */
  intentConfirmed?: boolean;
  /** Module 4 priority (business value × chance, 1–25). */
  priority: number;
  volume: number;
  /** 5.2 the page that should rank (null = 5.3 new page needed). */
  url: string | null;
  urlLocked: boolean;
  /** Why this page: "gets 34 clicks for these searches", "title matches", … */
  reason: string;
  match?: MatchStrength | null;
  /** 5.3 New page: the suggested address and what kind of page it should be. */
  suggestedPath?: string | null;
  newPageNote?: string | null;
  action: MappingAction;
  actionLocked: boolean;
  newPageType: ClusterPageType | null;
  primaryKeyword: string;
  secondaryKeywords: string[];
  currentPosition: number | null;
  targetPosition: number;
  /** 5.4 other pages getting a share of this topic's clicks (or impressions). */
  conflicts: { url: string; share: number }[];
  /** 5.4 The main page was confirmed by a person, and what happens to the other pages. */
  conflictSettled?: boolean;
  conflictPlan?: ConflictPlan | null;
  drafts: Drafts | null;
  /** Hand edits of the drafted fixes other than title, H1 and meta (section, FAQ, intro…). */
  edits?: Partial<Record<string, string>>;
  pageCheck?: PageCheck | null;
  /** When fixes for this page were last sent to the action plan for approval. */
  sentAt?: string | null;
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
  /** Keywords moved to another topic by hand (normalised term → cluster id). */
  moves?: Record<string, string>;
  /** Keywords added to a topic by hand on the one-page map (no search data). */
  added?: { term: string; clusterId: string }[];
  /** 5.1 Search Console queries per page (normalised URL → top 5 by clicks). */
  pageQueries?: Record<string, { query: string; clicks: number; impressions: number }[]>;
  /** Pages listed in the sitemap but not checked in the audit (used before saying a page is missing). */
  sitemapOnly?: string[];
};

export type MappingQuery = { query: string; page: string; clicks: number; impressions: number; position: number };

export const MAX_MAPPING_ROWS = 40;
export const emptyMapping = (domain: string): MappingWorkspace => ({ domain, builtAt: null, auditId: null, usedSearchConsole: false, rows: [] });

export const normUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
const STOP = new Set(['a', 'an', 'and', 'the', 'for', 'in', 'of', 'to', 'near', 'me', 'my', 'best', 'top', 'cost', 'price', 'company', 'services', 'service']);
const tokens = (s: string) => normTerm(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w)).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));

/** The path of an address ("https://x.com/a/" → "/a/"), or the input when it is not a URL. */
export function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** The words of a page address ("/services/ac-repair/" → "services ac repair"); never throws on bad escapes. */
export function pathWords(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    // Malformed %-escape: keep the raw address.
  }
  return path.replace(/[-_/.]+/g, ' ').trim();
}

/** Share of the topic's words found in the page's title, H1 and address (0–1). */
function textMatch(head: string, p: Pick<ReportPage, 'url' | 'title' | 'h1'>): number {
  const want = [...new Set(tokens(head))];
  if (!want.length) return 0;
  const have = new Set(tokens(`${p.title ?? ''} ${p.h1 ?? ''} ${pathWords(p.url)}`));
  return want.filter((w) => have.has(w)).length / want.length;
}

/** Abbreviations that stay in capitals in titles ("AC Repair", not "Ac Repair"). */
const ACRONYMS = new Set(['ac', 'hvac', 'uk', 'usa', 'diy', 'tv', 'led', 'seo', 'ppc', 'ev', 'uae', 'nyc']);
export const titleCase = (s: string) =>
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

const PATH_PREFIX: Partial<Record<ClusterPageType, string>> = { service: '/services/', service_location: '/services/', location: '/areas/', blog_post: '/blog/', product: '/products/' };

/** 5.3 Suggested address for a new page: the topic's words without the place or "near me", under the usual folder for its type. */
export function suggestPath(topic: string, pageType: ClusterPageType | null, places: string[] = []): string {
  let words = ` ${normTerm(topic)} `;
  for (const p of places.map(normTerm).filter(Boolean)) words = words.replace(` ${p} `, ' ');
  words = words.replace(/ near me /g, ' ').replace(/ in /g, ' ');
  const slug = words.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'new-page';
  const prefix = pageType === 'location' && places.length ? '/areas/' : (pageType && PATH_PREFIX[pageType]) ?? '/';
  return `${prefix}${slug}/`;
}

/** 5.3 What kind of page to make, in one line. */
export function newPageNote(head: string, pageType: ClusterPageType | null): string {
  if (/\b(cost|costs|price|prices|pricing|how much)\b/.test(head)) return 'Guide with a price range table';
  switch (pageType) {
    case 'location': return 'Location page with local reviews and the services offered there';
    case 'blog_post': return 'Helpful article that answers the question in the first lines';
    case 'product': return 'Product page with photos, price and reviews';
    case 'category': return 'Category page listing the products, with a short intro';
    case 'directory': return 'Google shows directories here: get listed on them, and add a page comparing your options';
    case 'home': return 'Cover this on the homepage';
    default: return 'Service page with click-to-call and a short quote form';
  }
}

const target = (pos: number | null) => (pos === null ? 10 : pos <= 3 ? Math.max(1, Math.round(pos)) : pos <= 10 ? 3 : 10);

export type TopicKeyword = { term: string; volume: number | null; position: number | null; url: string | null; added?: boolean };

/** 5.5 The keywords of one topic after hand moves and additions, most searched first. */
export function topicKeywords(clusterId: string, head: string, keywords: KeywordRecord[], ws: Pick<MappingWorkspace, 'moves' | 'added'> | null | undefined): TopicKeyword[] {
  const moves = ws?.moves ?? {};
  const out = keywords
    .filter((k) => k.status === 'kept' && (moves[normTerm(k.term)] ?? k.clusterId) === clusterId)
    .map((k): TopicKeyword => ({ term: k.term, volume: k.volume, position: k.position, url: k.url }));
  for (const a of ws?.added ?? []) if (a.clusterId === clusterId && !out.some((k) => normTerm(k.term) === normTerm(a.term))) out.push({ term: a.term, volume: null, position: null, url: null, added: true });
  // A moved head keyword leaves its topic too; otherwise the head stays first.
  const headHere = (moves[normTerm(head)] ?? clusterId) === clusterId;
  out.sort((a, b) => (headHere && a.term === head ? -1 : headHere && b.term === head ? 1 : (b.volume ?? -1) - (a.volume ?? -1)));
  return out;
}

/** 5.1–5.13: one row per topic (highest priority first), the best page, the action and what to change. */
export function buildMapping(input: {
  domain: string;
  clusters: KeywordCluster[];
  keywords: KeywordRecord[];
  pages: ReportPage[];
  /** Sitemap addresses (pages the audit did not check are still existing pages). */
  sitemapUrls?: string[];
  gsc?: MappingQuery[];
  questions?: { keyword: string }[];
  previous?: MappingWorkspace | null;
  brand: string;
  place?: string | null;
  places?: string[];
  auditId?: string | null;
  now?: Date;
}): MappingWorkspace {
  const now = (input.now ?? new Date()).toISOString();
  const previous = input.previous ?? null;
  const prev = new Map((previous?.rows ?? []).map((r) => [r.clusterId, r]));
  const pageBy = new Map(input.pages.map((p) => [normUrl(p.url), p]));
  const sitemapOnly = [...new Set((input.sitemapUrls ?? []).filter((u) => !pageBy.has(normUrl(u))))].slice(0, 5000);
  const home = input.pages.find((p) => normUrl(p.url) === normUrl(`https://${input.domain}/`)) ?? input.pages.find((p) => pathWords(p.url) === '');
  const gscBy = new Map<string, MappingQuery[]>();
  for (const q of input.gsc ?? []) gscBy.set(normTerm(q.query), [...(gscBy.get(normTerm(q.query)) ?? []), q]);
  const questionTerms = new Set((input.questions ?? []).map((q) => q.keyword));
  const places = input.places ?? (input.place ? [input.place] : []);
  /** One page, one topic: pages already given to a higher-priority topic (normalised URL → topic). */
  const taken = new Map<string, string>();
  // Hand-picked pages are taken first, whatever their topic's priority.
  for (const r of previous?.rows ?? []) if (r.urlLocked && r.url) taken.set(normUrl(r.url), r.topic);

  const rows = [...input.clusters]
    .sort((a, b) => b.priority - a.priority || b.volume - a.volume)
    .slice(0, MAX_MAPPING_ROWS)
    .map((c): MappingRow => {
      const old = prev.get(c.id);
      const members = topicKeywords(c.id, c.head, input.keywords, previous);
      const terms = new Set([c.head, ...members.map((m) => m.term)].map(normTerm));
      const free = (u: string) => {
        const owner = taken.get(normUrl(u));
        return !owner || owner === c.name;
      };

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
      let match: MatchStrength | null = null;
      if (old?.urlLocked) [url, reason, match] = [old.url, 'Chosen by hand', old.url ? 'high' : null];
      else if (evidence[0] && (evidence[0].clicks > 0 || evidence[0].impressions > 0)) {
        // Google already shows this page for the topic: keep it even when another topic has it (flagged below).
        url = evidence[0].url;
        match = 'high';
        reason = evidence[0].clicks > 0 ? `Gets ${evidence[0].clicks} clicks from Google for these searches` : `Shown ${evidence[0].impressions} times in Google for these searches`;
      } else if (ranked[0]?.url) [url, reason, match] = [ranked[0].url, `Already ranks #${ranked[0].position} for "${ranked[0].term}"`, 'high'];
      else {
        const pick = matched.find((m) => free(m.p.url));
        const fromSitemap = pick ? null : sitemapOnly.find((u) => free(u) && textMatch(c.head, { url: u, title: null, h1: null }) >= 0.6);
        if (pick) [url, reason, match] = [pick.p.url, 'Title, heading or address matches this topic', 'medium'];
        else if (fromSitemap) [url, reason, match] = [fromSitemap, 'Address matches this topic (listed in the sitemap, not checked in the audit yet)', 'low'];
        else if (matched[0]) reason = `No page of its own yet: the closest page, ${pathOf(matched[0].p.url)}, already targets “${taken.get(normUrl(matched[0].p.url))}”`;
        else reason = 'No page targets this topic yet';
      }

      const key = url ? normUrl(url) : null;
      const sharedWith = key && taken.has(key) && taken.get(key) !== c.name ? taken.get(key)! : null;
      if (sharedWith) reason += `. This page also targets “${sharedWith}”: give one of the topics its own page`;
      if (key && !taken.has(key)) taken.set(key, c.name);
      const page = key ? pageBy.get(key) ?? null : null;
      const e = key ? ev.get(key) : undefined;
      const totalClicks = evidence.reduce((s, x) => s + x.clicks, 0);
      const totalImpr = evidence.reduce((s, x) => s + x.impressions, 0);
      const conflicts = evidence
        .filter((x) => normUrl(x.url) !== key)
        .map((x) => ({ url: x.url, share: totalClicks > 0 ? x.clicks / totalClicks : totalImpr > 0 ? x.impressions / totalImpr : 0 }))
        .filter((x) => x.share >= 0.2)
        .map((x) => ({ ...x, share: Math.round(x.share * 100) / 100 }));
      // A settled conflict stays settled while the main page is the same.
      const settled = Boolean(old?.conflictSettled && old.url === url && conflicts.length);
      const conflictPlan: ConflictPlan | null = settled ? old?.conflictPlan ?? 'differentiate' : null;
      const currentPosition = e && e.impressions ? Math.round((e.posSum / e.impressions) * 10) / 10 : (ranked.find((r) => key && r.url && normUrl(r.url) === key)?.position ?? null);
      const typeMismatch = Boolean(page?.pageType && c.pageType && !['directory', 'home'].includes(c.pageType) && page.pageType !== c.pageType && !(c.pageType === 'service_location' && ['service', 'location'].includes(page.pageType)));

      let action: MappingAction;
      if (!url) action = 'create';
      else if (conflictPlan === 'merge') action = 'merge';
      else if (currentPosition !== null && currentPosition <= 3) action = 'leave';
      else if ((page && page.words < 300) || typeMismatch) action = 'expand';
      else action = 'optimise';
      if (old?.actionLocked) action = old.action;

      // 5.10 relevant pages that do not link to the target yet (for a new page: where to link from once it exists).
      const head = tokens(c.head);
      const linksToAdd = input.pages
        .filter((p) => !key || normUrl(p.url) !== key)
        .filter((p) => !key || !p.links.some((l) => normUrl(l) === key))
        .map((p) => ({ p, rel: head.filter((w) => tokens(`${p.title ?? ''} ${p.h1 ?? ''} ${pathWords(p.url)}`).includes(w)).length + (p === home ? 0.5 : 0) }))
        // Relevant = shares at least half of the topic's words (one shared word like "repair" is not enough).
        .filter((x) => x.rel >= Math.max(1, Math.ceil(head.length / 2)))
        .sort((a, b) => b.rel - a.rel || a.p.url.length - b.p.url.length)
        .slice(0, 5)
        .map((x) => ({ from: x.p.url, anchor: c.head }));

      const secondary = members.map((m) => m.term).filter((t) => t !== c.head).slice(0, 5);
      const faq = [...terms].some((t) => questionTerms.has(t));
      const samePage = old && old.url === url;
      return {
        clusterId: c.id,
        topic: c.name,
        intent: c.intent,
        intentConfirmed: samePage ? old.intentConfirmed ?? false : false,
        priority: c.priority,
        volume: c.volume,
        url,
        urlLocked: old?.urlLocked ?? false,
        reason,
        match,
        suggestedPath: url ? null : suggestPath(c.name, c.pageType, places),
        newPageNote: url ? null : newPageNote(normTerm(c.head), c.pageType),
        action,
        actionLocked: old?.actionLocked ?? false,
        newPageType: url ? null : c.pageType,
        primaryKeyword: c.head,
        secondaryKeywords: secondary,
        currentPosition,
        targetPosition: target(currentPosition),
        conflicts,
        conflictSettled: settled,
        conflictPlan,
        drafts: old?.drafts ?? templateDrafts(c.head, input.brand, input.place ?? null),
        edits: old?.edits ?? {},
        pageCheck: samePage ? old.pageCheck ?? null : null,
        sentAt: old?.sentAt ?? null,
        linksToAdd,
        schemaNeeded: schemaFor(url ? page?.pageType ?? null : c.pageType, page?.schemaTypes ?? [], faq),
        owner: old?.owner ?? null,
        status: old?.status ?? 'todo',
        updatedAt: old && old.url === url && old.action === action ? old.updatedAt : now,
      };
    });

  // 5.1 current queries per page (top 5 by clicks).
  const byPage = new Map<string, { query: string; clicks: number; impressions: number }[]>();
  for (const q of input.gsc ?? []) byPage.set(normUrl(q.page), [...(byPage.get(normUrl(q.page)) ?? []), { query: q.query, clicks: q.clicks, impressions: q.impressions }]);
  const pageQueries = Object.fromEntries([...byPage].map(([k, v]) => [k, v.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 5)]));

  return {
    domain: input.domain,
    builtAt: now,
    auditId: input.auditId ?? null,
    usedSearchConsole: Boolean(input.gsc?.length),
    rows,
    moves: previous?.moves ?? {},
    added: previous?.added ?? [],
    pageQueries,
    sitemapOnly,
  };
}

/** Rows that need a person first: unsettled conflicts, new pages, and pages shared by two topics. */
export const needsYou = (r: MappingRow) => (r.conflicts.length > 0 && !r.conflictSettled) || !r.url || /also targets/.test(r.reason);

/** 5.1 page inventory: every audited page (and sitemap-only page) with its topics and current Search Console queries. */
export function pageInventory(
  ws: MappingWorkspace,
  pages: ReportPage[],
): { url: string; title: string | null; h1: string | null; words: number | null; pageType: string | null; checked: boolean; topics: string[]; queries: string[] }[] {
  const topics = new Map<string, string[]>();
  for (const r of ws.rows) if (r.url) topics.set(normUrl(r.url), [...(topics.get(normUrl(r.url)) ?? []), r.topic]);
  const q = (u: string) => (ws.pageQueries?.[normUrl(u)] ?? []).map((x) => x.query);
  return [
    ...pages.map((p) => ({ url: p.url, title: p.title, h1: p.h1, words: p.words, pageType: p.pageType, checked: true, topics: topics.get(normUrl(p.url)) ?? [], queries: q(p.url) })),
    ...(ws.sitemapOnly ?? []).map((u) => ({ url: u, title: null, h1: null, words: null, pageType: null, checked: false, topics: topics.get(normUrl(u)) ?? [], queries: q(u) })),
  ];
}

export type MappingPatch = Partial<Pick<MappingRow, 'action' | 'url' | 'owner' | 'status' | 'intentConfirmed'>> & {
  drafts?: Partial<Omit<Drafts, 'source'>> & { source?: Drafts['source'] };
  /** 5.4 Confirm the main page and what happens to the other page(s). */
  settle?: ConflictPlan;
  edit?: { id: string; text: string };
  pageCheck?: PageCheck | null;
  sentAt?: string;
};

/** Hand edits for one row (5.9 action, 5.2 page, 5.4 conflicts, 5.6 intent, 5.12–5.13 owner and status, 5.8 drafts). */
export function updateMappingRow(ws: MappingWorkspace, clusterId: string, patch: MappingPatch, now = new Date()): MappingWorkspace {
  return {
    ...ws,
    rows: ws.rows.map((r) => {
      if (r.clusterId !== clusterId) return r;
      const next: MappingRow = { ...r, updatedAt: now.toISOString() };
      if (patch.action && patch.action !== r.action) Object.assign(next, { action: patch.action, actionLocked: true });
      if (patch.url !== undefined && patch.url !== r.url) {
        Object.assign(next, { url: patch.url, urlLocked: true, reason: 'Chosen by hand', match: patch.url ? 'high' : null, newPageType: patch.url ? null : r.newPageType, pageCheck: null, intentConfirmed: false });
        // The other pages competing for the topic may now include the old main page.
        if (patch.url && r.url && r.conflicts.some((c) => normUrl(c.url) === normUrl(patch.url!))) {
          next.conflicts = [...r.conflicts.filter((c) => normUrl(c.url) !== normUrl(patch.url!)), { url: r.url, share: 0 }];
        }
        if (!patch.url && !r.actionLocked) next.action = 'create';
        if (patch.url && r.action === 'create' && !r.actionLocked) next.action = 'optimise';
      }
      if (patch.settle) {
        next.conflictSettled = true;
        next.conflictPlan = patch.settle;
        next.urlLocked = true;
        if (patch.settle === 'merge') Object.assign(next, { action: 'merge', actionLocked: true });
        else if (r.action === 'merge') Object.assign(next, { action: 'optimise', actionLocked: false });
      }
      if (patch.intentConfirmed !== undefined) next.intentConfirmed = patch.intentConfirmed;
      if (patch.owner !== undefined) next.owner = patch.owner?.trim().slice(0, 80) || null;
      if (patch.status) next.status = patch.status;
      if (patch.pageCheck !== undefined) next.pageCheck = patch.pageCheck;
      if (patch.sentAt) next.sentAt = patch.sentAt;
      if (patch.edit) next.edits = { ...(r.edits ?? {}), [patch.edit.id]: patch.edit.text.trim().slice(0, 1200) };
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

/** "Move" a keyword to another topic (each keyword belongs to one page), or add one by hand. */
export function moveKeyword(ws: MappingWorkspace, term: string, toClusterId: string): MappingWorkspace {
  const t = normTerm(term);
  const added = (ws.added ?? []).map((a) => (normTerm(a.term) === t ? { ...a, clusterId: toClusterId } : a));
  return { ...ws, moves: { ...(ws.moves ?? {}), [t]: toClusterId }, added };
}
export function addTopicKeyword(ws: MappingWorkspace, term: string, clusterId: string): MappingWorkspace {
  const clean = term.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean || (ws.added ?? []).some((a) => normTerm(a.term) === normTerm(clean))) return ws;
  return { ...ws, added: [...(ws.added ?? []), { term: clean, clusterId }].slice(-200), moves: { ...(ws.moves ?? {}), [normTerm(clean)]: clusterId } };
}

/**
 * Feeds Module 2: the primary keyword of every mapped page, so rules 2.1.4, 2.2.4, 2.3.2 and
 * 2.4.3 check the keyword the page is meant to rank for instead of guessing from its address.
 * The highest-priority topic wins when two topics share a page.
 */
export function pageKeywordMap(ws: MappingWorkspace | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of ws?.rows ?? []) if (r.url && !out[normUrl(r.url)]) out[normUrl(r.url)] = r.primaryKeyword;
  return out;
}

const STATUS_ORDER: Record<MappingStatus, number> = { todo: 0, in_progress: 1, live: 2, verified: 3 };
export const mappingSummary = (ws: MappingWorkspace) => ({
  rows: ws.rows.length,
  mapped: ws.rows.filter((r) => r.url && !(r.conflicts.length && !r.conflictSettled)).length,
  newPages: ws.rows.filter((r) => !r.url).length,
  conflicts: ws.rows.filter((r) => r.conflicts.length && !r.conflictSettled).length,
  needsYou: ws.rows.filter(needsYou).length,
  done: ws.rows.filter((r) => STATUS_ORDER[r.status] >= 2).length,
});

/** CSV export of the page plan (one row per topic). */
export function mappingToCsv(ws: MappingWorkspace): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['priority', 'topic', 'page', 'match', 'action', 'new_page_type', 'suggested_address', 'primary_keyword', 'secondary_keywords', 'intent', 'position', 'target', 'competing_pages', 'conflict_plan', 'new_title', 'new_h1', 'new_meta', 'approved', 'links_to_add', 'schema_to_add', 'owner', 'status'];
  const rows = ws.rows.map((r) => [
    r.priority, r.topic, r.url ?? 'NEW PAGE NEEDED', r.match ?? '', r.action, r.newPageType, r.suggestedPath ?? '', r.primaryKeyword, r.secondaryKeywords.join('; '), r.intent ?? '', r.currentPosition, r.targetPosition,
    r.conflicts.map((c) => c.url).join(' '), r.conflictSettled ? r.conflictPlan ?? '' : r.conflicts.length ? 'not settled' : '', r.drafts?.title, r.drafts?.h1, r.drafts?.meta, r.drafts?.approved ? 'yes' : 'no',
    r.linksToAdd.map((l) => `${l.from} → "${l.anchor}"`).join(' | '), r.schemaNeeded.join(', '), r.owner, r.status,
  ]);
  return `﻿${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
