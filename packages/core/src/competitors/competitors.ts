import type { CompetitorClient, Locale, MonthPoint } from '../providers/dataforseo-competitors';

/**
 * Module 3 · Competitor identification (spec §16.2). One workspace per website (keyed by
 * domain), used by the team for any client and by customers for their own sites.
 *  3.1 manual entry · 3.2 Labs competitors · 3.3 live SERPs for the core searches
 *  3.4 local pack · 3.5 auto-type + manual override · 3.6 shortlist (5–8 direct, 2–3 aspirational)
 *  3.7 directories/publishers as listing and link targets · 3.8 strength snapshot
 *  3.9 quarterly refresh with "new competitor" flags (worker).
 */
export type CompetitorType = 'direct' | 'search' | 'local' | 'directory' | 'publisher';
export type Shortlist = 'none' | 'direct' | 'aspirational';
export type CompetitorSource = 'labs' | 'serp' | 'local' | 'manual';

export type CompetitorRecord = {
  domain: string;
  name: string | null;
  type: CompetitorType;
  /** Set when someone chose the type by hand: discovery no longer changes it. */
  typeLocked: boolean;
  shortlist: Shortlist;
  sources: CompetitorSource[];
  /** Core searches (organic or local pack) the domain appeared in on the last run. */
  seenIn: number;
  avgPosition: number | null;
  /** Organic keywords shared with the client's site (Labs). */
  sharedKeywords: number | null;
  /** Estimated monthly organic visits (Labs etv) and ranking keywords. */
  etv: number | null;
  keywords: number | null;
  trend: MonthPoint[] | null;
  notes: string | null;
  /** Appeared on a refresh after the first run (cleared when someone shortlists or reviews it). */
  isNew: boolean;
  firstSeenAt: string;
  refreshedAt: string | null;
};

export type CompetitorWorkspace = {
  domain: string;
  country: string;
  language: string;
  /** Core searches (3.3/3.4), e.g. "ac repair dallas"; at most MAX_SEARCHES. */
  searches: string[];
  lastRunAt: string | null;
  strengthAt: string | null;
  competitors: CompetitorRecord[];
};

export const MAX_SEARCHES = 15;
export const SHORTLIST_TARGET = { direct: [5, 8], aspirational: [2, 3] } as const;

/** DataForSEO location names (Labs + SERP) we offer; a free-text country falls back to the US. */
export const COMPETITOR_COUNTRIES = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Pakistan', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'India', 'Ireland', 'New Zealand', 'South Africa', 'Germany'] as const;
export const COMPETITOR_LANGUAGES = { en: 'English', ur: 'Urdu', ar: 'Arabic', es: 'Spanish', fr: 'French', de: 'German' } as const;

export const normDomain = (d: string) =>
  d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '').replace(/\.$/, '');

const ends = (domain: string, list: Set<string>) => [...list].some((d) => domain === d || domain.endsWith(`.${d}`));

/** Review sites, directories and marketplaces: listing targets, not competitors (3.5, 3.7). */
export const DIRECTORIES = new Set([
  'yelp.com', 'angi.com', 'angieslist.com', 'homeadvisor.com', 'bbb.org', 'thumbtack.com', 'yellowpages.com', 'yahoo.com', 'mapquest.com',
  'nextdoor.com', 'houzz.com', 'porch.com', 'bark.com', 'manta.com', 'superpages.com', 'citysearch.com', 'foursquare.com', 'tripadvisor.com',
  'expertise.com', 'threebestrated.com', 'trustpilot.com', 'facebook.com', 'linkedin.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com',
  'networx.com', 'fixr.com', 'taskrabbit.com', 'checkatrade.com', 'mybuilder.com', 'ratedpeople.com', 'trustatrader.com', 'yell.com', 'hipages.com.au',
  'homestars.com', 'olx.com.pk', 'olx.com', 'daraz.pk', 'urbancompany.com', 'mrmaintenance.pk', 'servicemarket.com', 'justdial.com', 'sulekha.com',
]);
/** Encyclopedias, forums, video and media: content and link targets (3.7). */
export const PUBLISHERS = new Set([
  'wikipedia.org', 'reddit.com', 'quora.com', 'youtube.com', 'medium.com', 'forbes.com', 'nytimes.com', 'consumerreports.org', 'thisoldhouse.com',
  'bobvila.com', 'familyhandyman.com', 'energy.gov', 'energystar.gov', 'bhg.com', 'thespruce.com', 'bankrate.com', 'nerdwallet.com', 'dawn.com', 'tribune.com.pk',
]);
/** Never competitors: search engines and Google surfaces. */
const IGNORE = new Set(['google.com', 'maps.google.com', 'bing.com', 'apple.com', 'gstatic.com']);

/** 3.5 Auto-type (a locked, hand-picked type is kept). */
export function classify(c: Pick<CompetitorRecord, 'domain' | 'sources' | 'seenIn' | 'type' | 'typeLocked'>): CompetitorType {
  if (c.typeLocked) return c.type;
  if (ends(c.domain, DIRECTORIES)) return 'directory';
  if (ends(c.domain, PUBLISHERS)) return 'publisher';
  const local = c.sources.includes('local');
  const serp = c.sources.includes('serp');
  // In the map pack for several searches, or in both the map pack and the results: a direct rival.
  if (local && (serp || c.seenIn >= 2)) return 'direct';
  if (local) return 'local';
  if (serp && c.seenIn >= 2) return 'direct';
  if (c.sources.includes('manual')) return 'direct';
  return 'search';
}

/** Default core searches from the business profile: service × area, then services alone (3.3). */
export function defaultSearches(services: string[], areas: string[]): string[] {
  const s = services.map((x) => x.trim().toLowerCase()).filter(Boolean);
  const a = areas.map((x) => x.trim().toLowerCase()).filter(Boolean);
  const combos = a.length ? s.flatMap((svc) => a.map((area) => `${svc} ${area}`)) : s;
  return [...new Set(combos)].slice(0, MAX_SEARCHES);
}

export function emptyWorkspace(domain: string, init: Partial<Pick<CompetitorWorkspace, 'country' | 'language' | 'searches'>> = {}): CompetitorWorkspace {
  const country = (COMPETITOR_COUNTRIES as readonly string[]).includes(init.country ?? '') ? init.country! : 'United States';
  const language = init.language && init.language in COMPETITOR_LANGUAGES ? init.language : 'en';
  return { domain: normDomain(domain), country, language, searches: (init.searches ?? []).slice(0, MAX_SEARCHES), lastRunAt: null, strengthAt: null, competitors: [] };
}

const isOwn = (domain: string, own: string) => domain === own || domain.endsWith(`.${own}`) || own.endsWith(`.${domain}`);

type Found = { domain: string; name: string | null; sources: Set<CompetitorSource>; searches: Set<number>; positions: number[]; shared: number | null; labsAvg: number | null; etv: number | null; keywords: number | null };

async function pool<T>(items: T[], limit: number, fn: (t: T, i: number) => Promise<void>) {
  const queue = items.map((t, i) => [t, i] as const);
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await fn(next[0], next[1]);
  }));
}

/**
 * 3.2–3.5: Labs competitors + live SERPs (organic and local pack) for every core search,
 * merged into the workspace. Hand-made choices (shortlist, notes, locked types) are kept;
 * domains that appear for the first time on a later run are flagged `isNew`.
 */
export async function discoverCompetitors(client: CompetitorClient, ws: CompetitorWorkspace, now = new Date()): Promise<{ workspace: CompetitorWorkspace; cost: number; errors: string[]; newDomains: string[] }> {
  const locale: Locale = { country: ws.country, language: ws.language };
  const found = new Map<string, Found>();
  const errors: string[] = [];
  let cost = 0;
  const touch = (raw: string) => {
    const domain = normDomain(raw);
    if (!domain || IGNORE.has(domain) || isOwn(domain, ws.domain)) return null;
    const f = found.get(domain) ?? { domain, name: null, sources: new Set(), searches: new Set(), positions: [], shared: null, labsAvg: null, etv: null, keywords: null };
    found.set(domain, f);
    return f;
  };

  const labs = client.competitorsDomain(ws.domain, locale, 30).then(
    (r) => {
      cost += r.cost;
      for (const d of r.domains) {
        const f = touch(d.domain);
        if (!f) continue;
        f.sources.add('labs');
        f.shared = d.intersections;
        f.labsAvg = d.avgPosition;
        f.etv = d.etv;
        f.keywords = d.keywords;
      }
    },
    (err: unknown) => errors.push(`Competitor database: ${err instanceof Error ? err.message : String(err)}`),
  );
  const serps = pool(ws.searches.slice(0, MAX_SEARCHES), 5, async (q, i) => {
    try {
      const r = await client.serp(q, locale);
      cost += r.cost;
      for (const e of r.entries) {
        const f = touch(e.domain);
        if (!f) continue;
        f.sources.add(e.kind === 'local' ? 'local' : 'serp');
        f.searches.add(i);
        if (e.position) f.positions.push(e.position);
        if (e.kind === 'local' && e.title && !f.name) f.name = e.title;
      }
    } catch (err) {
      errors.push(`"${q}": ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  await Promise.all([labs, serps]);

  // 3.8 basics for domains seen in the searches but not in the Labs list (cheap rank overview, top 10).
  const missing = [...found.values()].filter((f) => f.etv === null && !ends(f.domain, DIRECTORIES) && !ends(f.domain, PUBLISHERS)).sort((a, b) => b.searches.size - a.searches.size).slice(0, 10);
  await pool(missing, 5, async (f) => {
    try {
      const r = await client.rankOverview(f.domain, locale);
      cost += r.cost;
      f.etv = r.overview.etv;
      f.keywords = r.overview.keywords;
    } catch {
      // metrics stay empty; the competitor is still listed
    }
  });

  const firstRun = ws.lastRunAt === null && ws.competitors.every((c) => c.sources.includes('manual'));
  const iso = now.toISOString();
  const byDomain = new Map(ws.competitors.map((c) => [c.domain, c]));
  const newDomains: string[] = [];
  for (const f of found.values()) {
    const prev = byDomain.get(f.domain);
    const sources = [...new Set([...(prev?.sources.filter((s) => s === 'manual') ?? []), ...f.sources])] as CompetitorSource[];
    const avg = f.positions.length ? f.positions.reduce((s, p) => s + p, 0) / f.positions.length : f.labsAvg;
    const base: CompetitorRecord = {
      domain: f.domain,
      name: prev?.name ?? f.name,
      type: prev?.type ?? 'search',
      typeLocked: prev?.typeLocked ?? false,
      shortlist: prev?.shortlist ?? 'none',
      sources,
      seenIn: f.searches.size,
      avgPosition: avg === null ? null : Math.round(avg * 10) / 10,
      sharedKeywords: f.shared ?? prev?.sharedKeywords ?? null,
      etv: f.etv ?? prev?.etv ?? null,
      keywords: f.keywords ?? prev?.keywords ?? null,
      trend: prev?.trend ?? null,
      notes: prev?.notes ?? null,
      isNew: prev ? prev.isNew : !firstRun,
      firstSeenAt: prev?.firstSeenAt ?? iso,
      refreshedAt: iso,
    };
    base.type = classify(base);
    if (!prev && !firstRun) newDomains.push(f.domain);
    byDomain.set(f.domain, base);
  }
  // Domains not seen this time stay (with seenIn 0) so hand-made choices are never lost.
  for (const [domain, c] of byDomain) if (!found.has(domain) && !c.sources.includes('manual')) byDomain.set(domain, { ...c, seenIn: 0 });

  return { workspace: { ...ws, lastRunAt: iso, competitors: sortCompetitors([...byDomain.values()]) }, cost, errors, newDomains };
}

/** 3.8 Strength snapshot for the shortlist: traffic, keywords and a 12-month trend. */
export async function refreshStrength(client: CompetitorClient, ws: CompetitorWorkspace, now = new Date()): Promise<{ workspace: CompetitorWorkspace; cost: number; errors: string[] }> {
  const locale: Locale = { country: ws.country, language: ws.language };
  const targets = ws.competitors.filter((c) => c.shortlist !== 'none').slice(0, SHORTLIST_TARGET.direct[1] + SHORTLIST_TARGET.aspirational[1]);
  const updated = new Map(ws.competitors.map((c) => [c.domain, c]));
  const errors: string[] = [];
  let cost = 0;
  await pool(targets, 4, async (c) => {
    try {
      const [rank, hist] = await Promise.all([client.rankOverview(c.domain, locale), client.history(c.domain, locale, now)]);
      cost += rank.cost + hist.cost;
      updated.set(c.domain, { ...c, etv: rank.overview.etv, keywords: rank.overview.keywords, trend: hist.months, refreshedAt: now.toISOString() });
    } catch (err) {
      errors.push(`${c.domain}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  return { workspace: { ...ws, strengthAt: now.toISOString(), competitors: sortCompetitors([...updated.values()]) }, cost, errors };
}

const TYPE_ORDER: Record<CompetitorType, number> = { direct: 0, local: 1, search: 2, directory: 3, publisher: 4 };
const SHORT_ORDER: Record<Shortlist, number> = { direct: 0, aspirational: 1, none: 2 };

/** Shortlisted first, then by type, then by how often they appear in the core searches. */
export function sortCompetitors(list: CompetitorRecord[]): CompetitorRecord[] {
  return [...list].sort(
    (a, b) =>
      SHORT_ORDER[a.shortlist] - SHORT_ORDER[b.shortlist] ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      b.seenIn - a.seenIn ||
      (b.sharedKeywords ?? 0) - (a.sharedKeywords ?? 0) ||
      a.domain.localeCompare(b.domain),
  );
}

/** 3.1 Manual entry (also used to re-add a removed competitor). */
export function addManualCompetitor(ws: CompetitorWorkspace, input: { domain: string; name?: string | null; type?: CompetitorType }, now = new Date()): CompetitorWorkspace {
  const domain = normDomain(input.domain);
  if (!domain || isOwn(domain, ws.domain)) return ws;
  const prev = ws.competitors.find((c) => c.domain === domain);
  const record: CompetitorRecord = prev
    ? { ...prev, name: input.name ?? prev.name, sources: [...new Set([...prev.sources, 'manual' as const])], ...(input.type ? { type: input.type, typeLocked: true } : {}) }
    : {
        domain, name: input.name ?? null, type: input.type ?? 'direct', typeLocked: Boolean(input.type), shortlist: 'none', sources: ['manual'], seenIn: 0, avgPosition: null,
        sharedKeywords: null, etv: null, keywords: null, trend: null, notes: null, isNew: false, firstSeenAt: now.toISOString(), refreshedAt: null,
      };
  return { ...ws, competitors: sortCompetitors([...ws.competitors.filter((c) => c.domain !== domain), record]) };
}

/** 3.5 override / 3.6 shortlist / notes for one competitor. Reviewing it clears "new". */
export function updateCompetitor(ws: CompetitorWorkspace, domain: string, patch: { type?: CompetitorType; shortlist?: Shortlist; notes?: string | null }): CompetitorWorkspace {
  return {
    ...ws,
    competitors: sortCompetitors(
      ws.competitors.map((c) =>
        c.domain !== domain
          ? c
          : {
              ...c,
              ...(patch.type && patch.type !== c.type ? { type: patch.type, typeLocked: true } : {}),
              ...(patch.shortlist ? { shortlist: patch.shortlist } : {}),
              ...(patch.notes !== undefined ? { notes: patch.notes?.slice(0, 500) || null } : {}),
              isNew: false,
            },
      ),
    ),
  };
}

export function removeCompetitor(ws: CompetitorWorkspace, domain: string): CompetitorWorkspace {
  return { ...ws, competitors: ws.competitors.filter((c) => c.domain !== domain) };
}

/** 3.6 Shortlist health: counts against the 5–8 direct / 2–3 aspirational targets. */
export function shortlistStatus(ws: CompetitorWorkspace): { direct: number; aspirational: number; warnings: string[] } {
  const direct = ws.competitors.filter((c) => c.shortlist === 'direct').length;
  const aspirational = ws.competitors.filter((c) => c.shortlist === 'aspirational').length;
  const warnings: string[] = [];
  const [dMin, dMax] = SHORTLIST_TARGET.direct;
  const [aMin, aMax] = SHORTLIST_TARGET.aspirational;
  if (direct < dMin) warnings.push(`Pick ${dMin}–${dMax} direct competitors (${direct} so far).`);
  if (direct > dMax) warnings.push(`${direct} direct competitors is a lot: keep the ${dMax} that matter most.`);
  if (aspirational < aMin) warnings.push(`Pick ${aMin}–${aMax} aspirational competitors, the sites you want to catch up with (${aspirational} so far).`);
  if (aspirational > aMax) warnings.push(`Keep at most ${aMax} aspirational competitors.`);
  return { direct, aspirational, warnings };
}
