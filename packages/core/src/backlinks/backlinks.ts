import { normTerm } from '../keywords/clean';
import { pathWords } from '../mapping/mapping';
import { DfsAccessError } from '../providers/dataforseo-base';
import type { AnchorRow, Backlink, BacklinksClient, LinkedPage, LinkSummary, Mention, NewLost, RefDomain } from '../providers/dataforseo-backlinks';

/**
 * Module 8 · Backlink audit (spec §16.2), one workspace per website: the latest audit plus the
 * outreach list (8.10). 8.1 totals · 8.2 quality and relevance · 8.3 toxic links and spikes ·
 * 8.4 anchor mix · 8.5 lost links (90 days) · 8.6 backlinks to broken pages with a redirect
 * suggestion (also feeds rule 1.5.7) · 8.7 unlinked brand mentions · 8.8 top linked pages ·
 * 8.9 link gap with the direct competitors (also 6.4.4 / 6.7.3) · 8.10 outreach, sent by a person.
 */
export type Quality = 'strong' | 'good' | 'weak' | 'toxic';
export type LinkType = 'directory' | 'news' | 'association' | 'education' | 'government' | 'social' | 'blog' | 'business' | 'other';
export type AnchorKind = 'brand' | 'exact' | 'partial' | 'generic' | 'url' | 'empty' | 'other';

export type ScoredDomain = RefDomain & { quality: Quality; relevant: boolean; local: boolean; type: LinkType };
export type GapDomain = { domain: string; rank: number | null; linksTo: string[]; type: LinkType };
export type BrokenRow = Backlink & { suggestion: string | null };
export type CompetitorLinks = {
  domain: string; rank: number | null; referringDomains: number | null; backlinks: number | null; spamScore: number | null; newDomains90: number | null;
  /** 6.4.3 Their anchor text mix (% of linking sites per kind) and 6.4.5 their most linked pages (2026-11-19 on). */
  anchorMix?: Record<AnchorKind, number> | null;
  topPages?: LinkedPage[];
};

export type BacklinkAudit = {
  domain: string;
  runAt: string;
  costUsd: number;
  summary: LinkSummary;
  domains: ScoredDomain[];
  quality: Record<Quality, number>;
  anchors: (AnchorRow & { kind: AnchorKind })[];
  anchorMix: Record<AnchorKind, number>;
  series: NewLost[];
  spikes: { date: string; newDomains: number }[];
  lost: Backlink[];
  broken: BrokenRow[];
  topPages: LinkedPage[];
  gap: GapDomain[];
  mentions: Mention[];
  competitors: CompetitorLinks[];
  notes: string[];
};

export type OutreachStatus = 'todo' | 'contacted' | 'replied' | 'won' | 'lost';
export type OutreachSource = 'gap' | 'mention' | 'broken' | 'local' | 'manual';
export type OutreachTarget = { domain: string; source: OutreachSource; reason: string; url: string | null; contact: string | null; owner: string | null; status: OutreachStatus; notes: string | null; addedAt: string; updatedAt: string };
export type BacklinkWorkspace = { domain: string; audit: BacklinkAudit | null; outreach: OutreachTarget[] };
export const emptyBacklinks = (domain: string): BacklinkWorkspace => ({ domain, audit: null, outreach: [] });

export const BACKLINK_LIMITS = { domains: 200, anchors: 100, pages: 20, lost: 100, broken: 100, gap: 30, competitors: 3, mentions: 100 } as const;
/** Rough cost of one run (USD) before the real charge is read from the balance. */
export const BACKLINK_ESTIMATE_USD = 0.55;

const SOCIAL = /(^|\.)(facebook|instagram|twitter|x|linkedin|youtube|pinterest|tiktok|reddit|quora|medium)\.com$/;
const DIRECTORY = /yelp|yellowpages|yell\.com|bbb\.org|angi|homeadvisor|thumbtack|houzz|manta|mapquest|foursquare|nextdoor|checkatrade|trustpilot|bark\.com|porch|hotfrog|cylex|brownbook|merchantcircle|chamberofcommerce|superpages|citysearch|local\.com|ezlocal|showmelocal/;
const NEWS = /news|times|post|herald|gazette|tribune|journal|chronicle|daily|patch\.com|press|magazine/;
const ASSOCIATION = /association|assoc|chamber|council|institute|federation|society|union|guild|\.org$/;

/** 8.4 / 6.4.3 Share of linking sites per anchor kind (%). */
export function mixOf(anchors: { domains: number; kind: AnchorKind }[]): Record<AnchorKind, number> {
  const raw: Record<AnchorKind, number> = { brand: 0, exact: 0, partial: 0, generic: 0, url: 0, empty: 0, other: 0 };
  for (const a of anchors) raw[a.kind] += a.domains;
  const total = Object.values(raw).reduce((x, y) => x + y, 0) || 1;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round((v / total) * 1000) / 10])) as Record<AnchorKind, number>;
}

/** 6.4.6 What kind of site a linking domain is (heuristic from the name and TLD). */
export function linkType(domain: string): LinkType {
  const d = domain.toLowerCase();
  if (/\.gov(\.|$)|\.gov\.[a-z]{2}$/.test(d)) return 'government';
  if (/\.edu(\.|$)|\.ac\.[a-z]{2}$/.test(d)) return 'education';
  if (SOCIAL.test(d)) return 'social';
  if (DIRECTORY.test(d)) return 'directory';
  if (NEWS.test(d)) return 'news';
  if (ASSOCIATION.test(d)) return 'association';
  if (/blog|wordpress\.com$|blogspot\.|substack\.com$/.test(d)) return 'blog';
  return d.endsWith('.com') || d.endsWith('.co.uk') || d.endsWith('.net') ? 'business' : 'other';
}

/** 8.2 Quality from the linking domain's rank (0–100) and spam score (0–100). */
export function quality(d: Pick<RefDomain, 'rank' | 'spamScore'>): Quality {
  if ((d.spamScore ?? 0) >= 60) return 'toxic';
  const r = d.rank ?? 0;
  return r >= 30 ? 'strong' : r >= 10 ? 'good' : 'weak';
}

const GENERIC = new Set(['click here', 'here', 'read more', 'learn more', 'more', 'website', 'this website', 'visit website', 'visit', 'link', 'this', 'home', 'homepage', 'source', 'view', 'continue reading', 'details', 'more info']);

/** 8.4 Anchor kind: brand, exact (a target keyword), partial (shares a keyword word), generic, address, empty or other. */
export function anchorKind(anchor: string, brand: string[], keywords: string[]): AnchorKind {
  const a = normTerm(anchor);
  if (!a) return 'empty';
  if (/^(https?:\/\/|www\.)|\.[a-z]{2,6}(\/|$)/i.test(anchor.trim())) return 'url';
  if (GENERIC.has(a)) return 'generic';
  if (brand.some((b) => b && a.includes(b))) return 'brand';
  if (keywords.some((k) => normTerm(k) === a)) return 'exact';
  const words = new Set(keywords.flatMap((k) => normTerm(k).split(' ').filter((w) => w.length > 3)));
  return a.split(' ').some((w) => words.has(w)) ? 'partial' : 'other';
}

/** 8.3 Weeks with unusually many new linking domains (3× the usual week, at least 10). */
export function spikesOf(series: NewLost[]): { date: string; newDomains: number }[] {
  const sorted = series.map((s) => s.newDomains).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
  return series.filter((s) => s.newDomains >= Math.max(10, median * 3)).map((s) => ({ date: s.date, newDomains: s.newDomains }));
}

/** 8.6 The live page a broken backlink should be redirected to (best word match on the address, else the homepage). */
export function redirectFor(brokenUrl: string, pages: string[], home: string): string | null {
  const want = new Set(pathWords(brokenUrl).toLowerCase().split(' ').filter((w) => w.length > 2));
  let best: { url: string; score: number } | null = null;
  for (const p of pages) {
    const have = pathWords(p).toLowerCase().split(' ').filter((w) => w.length > 2);
    const score = have.filter((w) => want.has(w)).length;
    if (score > 0 && (!best || score > best.score || (score === best.score && p.length < best.url.length))) best = { url: p, score };
  }
  return best?.url ?? home;
}

const isOwn = (d: string, domain: string) => d === domain || d.endsWith(`.${domain}`);

export async function runBacklinkAudit(
  input: { domain: string; competitors: string[]; brand: string | null; keywords: string[]; places: string[]; countryTld: string | null; pages: string[] },
  client: Pick<BacklinksClient, 'summary' | 'referringDomains' | 'anchors' | 'topPages' | 'newLost' | 'lostLinks' | 'brokenLinks' | 'linkGap' | 'mentions'>,
  now = new Date(),
): Promise<BacklinkAudit> {
  const { domain } = input;
  const notes: string[] = [];
  let cost = 0;
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const ago90 = new Date(now.getTime() - 90 * 86_400_000);
  const ago1y = new Date(now.getTime() - 365 * 86_400_000);
  const rivals = input.competitors.slice(0, BACKLINK_LIMITS.competitors);
  const soft = async <T>(label: string, f: () => Promise<T & { cost: number }>): Promise<T | null> => {
    try {
      const r = await f();
      cost += r.cost;
      return r;
    } catch (err) {
      // Not enabled on the account: the whole audit cannot run.
      if (err instanceof DfsAccessError) throw err;
      notes.push(`${label} could not be read.`);
      return null;
    }
  };

  // The summary first: it tells whether the Backlinks API is enabled at all.
  const first = await client.summary(domain);
  cost += first.cost;
  const summary = first.summary;

  const pairs = rivals.flatMap((a, i) => rivals.slice(i + 1).map((b) => [a, b] as const));
  const [domainsR, anchorsR, pagesR, seriesR, lostR, brokenR, mentionsR, rivalSummaries, gaps] = await Promise.all([
    soft('Linking domains', () => client.referringDomains(domain, BACKLINK_LIMITS.domains)),
    soft('Anchor texts', () => client.anchors(domain, BACKLINK_LIMITS.anchors)),
    soft('Top linked pages', () => client.topPages(domain, BACKLINK_LIMITS.pages)),
    soft('New and lost links over time', () => client.newLost(domain, day(ago1y))),
    soft('Lost links', () => client.lostLinks(domain, `${day(ago90)} 00:00:00 +00:00`, BACKLINK_LIMITS.lost)),
    soft('Broken backlinks', () => client.brokenLinks(domain, BACKLINK_LIMITS.broken)),
    input.brand ? soft('Brand mentions', () => client.mentions(input.brand!, BACKLINK_LIMITS.mentions)) : Promise.resolve(null),
    Promise.all(rivals.map(async (r): Promise<CompetitorLinks> => {
      const [s, t, an, tp] = await Promise.all([
        soft(`Links of ${r}`, () => client.summary(r)),
        soft(`New links of ${r}`, () => client.newLost(r, day(ago90))),
        soft(`Anchor texts of ${r}`, () => client.anchors(r, BACKLINK_LIMITS.anchors)),
        soft(`Top linked pages of ${r}`, () => client.topPages(r, 5)),
      ]);
      const rivalBrand = [normTerm(r.split('.')[0]!.replace(/-/g, ' ')), r.split('.')[0]!].filter((x) => x.length >= 3);
      return {
        domain: r, rank: s?.summary.rank ?? null, referringDomains: s?.summary.referringDomains ?? null, backlinks: s?.summary.backlinks ?? null, spamScore: s?.summary.spamScore ?? null,
        newDomains90: t ? t.series.reduce((x, y) => x + y.newDomains, 0) : null,
        anchorMix: an ? mixOf(an.anchors.map((a) => ({ ...a, kind: anchorKind(a.anchor, rivalBrand, input.keywords) }))) : null,
        topPages: tp?.pages.slice(0, 5) ?? [],
      };
    })),
    Promise.all(pairs.map(async ([a, b]) => ({ pair: [a, b], r: await soft(`Link gap ${a} + ${b}`, () => client.linkGap(a, b, domain, 100)) }))),
  ]);
  if (!input.brand) notes.push('No business name is known, so brand mentions were not searched.');
  if (rivals.length < 2) notes.push('Shortlist at least two direct competitors to find the link gap.');

  const words = (xs: string[]) => [...new Set(xs.flatMap((x) => normTerm(x).split(' ')).filter((w) => w.length > 3))];
  const topicWords = words(input.keywords);
  const placeWords = words(input.places);
  const domains: ScoredDomain[] = (domainsR?.domains ?? []).map((d) => {
    const name = d.domain.toLowerCase().replace(/[.-]/g, ' ');
    return {
      ...d,
      quality: quality(d),
      relevant: topicWords.some((w) => name.includes(w)),
      local: placeWords.some((w) => name.includes(w)) || Boolean(input.countryTld && d.domain.endsWith(input.countryTld) && input.countryTld !== '.com'),
      type: linkType(d.domain),
    };
  });
  const qualityCount: Record<Quality, number> = { strong: 0, good: 0, weak: 0, toxic: 0 };
  for (const d of domains) qualityCount[d.quality]++;

  const brandWords = [normTerm(input.brand ?? ''), normTerm(domain.split('.')[0]!.replace(/-/g, ' ')), domain.split('.')[0]!].filter((x) => x.length >= 3);
  const anchors = (anchorsR?.anchors ?? []).map((a) => ({ ...a, kind: anchorKind(a.anchor, brandWords, input.keywords) }));
  const anchorMix = mixOf(anchors);

  const home = `https://${domain}/`;
  const broken = (brokenR?.links ?? []).map((l) => ({ ...l, suggestion: redirectFor(l.to, input.pages, home) }));

  const linking = new Set(domains.map((d) => d.domain));
  const gapMap = new Map<string, GapDomain>();
  for (const g of gaps) {
    for (const d of g.r?.domains ?? []) {
      if (isOwn(d.domain, domain)) continue;
      const e = gapMap.get(d.domain) ?? { domain: d.domain, rank: d.rank, linksTo: [], type: linkType(d.domain) };
      for (const c of g.pair) if (!e.linksTo.includes(c)) e.linksTo.push(c);
      gapMap.set(d.domain, e);
    }
  }
  const gap = [...gapMap.values()].filter((g) => !linking.has(g.domain)).sort((a, b) => b.linksTo.length - a.linksTo.length || (b.rank ?? 0) - (a.rank ?? 0)).slice(0, BACKLINK_LIMITS.gap);

  const mentions = (mentionsR?.mentions ?? []).filter((m) => m.domain && !isOwn(m.domain, domain) && !linking.has(m.domain) && !SOCIAL.test(m.domain)).slice(0, 50);

  return {
    domain,
    runAt: now.toISOString(),
    costUsd: Math.round(cost * 10_000) / 10_000,
    summary,
    domains,
    quality: qualityCount,
    anchors,
    anchorMix,
    series: seriesR?.series ?? [],
    spikes: spikesOf(seriesR?.series ?? []),
    lost: lostR?.links ?? [],
    broken,
    topPages: pagesR?.pages ?? [],
    gap,
    mentions,
    competitors: rivalSummaries,
    notes,
  };
}

/** Rule 1.5.7: addresses on the site that other websites link to and that are now broken. */
export const brokenLinkedUrls = (a: BacklinkAudit | null | undefined): string[] => [...new Set((a?.broken ?? []).map((b) => b.to).filter(Boolean))];

/** 8.10 Adds outreach targets (never twice for the same domain). */
export function addOutreach(ws: BacklinkWorkspace, picks: Omit<OutreachTarget, 'contact' | 'owner' | 'status' | 'notes' | 'addedAt' | 'updatedAt'>[], now = new Date()): BacklinkWorkspace {
  const have = new Set(ws.outreach.map((o) => o.domain));
  const iso = now.toISOString();
  const added = picks.filter((p) => !have.has(p.domain)).map((p): OutreachTarget => ({ ...p, contact: null, owner: null, status: 'todo', notes: null, addedAt: iso, updatedAt: iso }));
  return { ...ws, outreach: [...ws.outreach, ...added].slice(0, 300) };
}

export function updateOutreach(ws: BacklinkWorkspace, domain: string, patch: Partial<Pick<OutreachTarget, 'contact' | 'owner' | 'status' | 'notes'>>, now = new Date()): BacklinkWorkspace {
  const clean = (v: string | null | undefined, max: number) => (v === undefined ? undefined : v?.trim().slice(0, max) || null);
  return {
    ...ws,
    outreach: ws.outreach.map((o) =>
      o.domain !== domain
        ? o
        : {
            ...o,
            ...(patch.status ? { status: patch.status } : {}),
            ...(patch.contact !== undefined ? { contact: clean(patch.contact, 200) ?? null } : {}),
            ...(patch.owner !== undefined ? { owner: clean(patch.owner, 80) ?? null } : {}),
            ...(patch.notes !== undefined ? { notes: clean(patch.notes, 600) ?? null } : {}),
            updatedAt: now.toISOString(),
          },
    ),
  };
}
export const removeOutreach = (ws: BacklinkWorkspace, domain: string): BacklinkWorkspace => ({ ...ws, outreach: ws.outreach.filter((o) => o.domain !== domain) });

/** CSV of one list: linking domains, link gap, broken backlinks or the outreach list. */
export function backlinksToCsv(ws: BacklinkWorkspace, list: 'domains' | 'gap' | 'broken' | 'outreach'): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const a = ws.audit;
  const rows: (string | number | boolean | null)[][] =
    list === 'domains' ? [['domain', 'rank', 'backlinks', 'spam_score', 'quality', 'relevant', 'local', 'type', 'first_seen'], ...(a?.domains ?? []).map((d) => [d.domain, d.rank, d.backlinks, d.spamScore, d.quality, d.relevant, d.local, d.type, d.firstSeen])]
    : list === 'gap' ? [['domain', 'rank', 'links_to', 'type'], ...(a?.gap ?? []).map((g) => [g.domain, g.rank, g.linksTo.join(' '), g.type])]
    : list === 'broken' ? [['linking_page', 'broken_page', 'status', 'anchor', 'redirect_to'], ...(a?.broken ?? []).map((b) => [b.from, b.to, b.toStatus, b.anchor, b.suggestion])]
    : [['domain', 'source', 'reason', 'url', 'contact', 'owner', 'status', 'notes'], ...ws.outreach.map((o) => [o.domain, o.source, o.reason, o.url, o.contact, o.owner, o.status, o.notes])];
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
