import type { PageContent } from '../audit/page-content';
import { phonesIn, schemaValues } from '../audit/content-signals';
import { normTerm } from '../keywords/clean';
import type { Locale } from '../providers/dataforseo-competitors';
import type { ListingHit, LocalClient, MapsResult, Profile } from '../providers/dataforseo-local';
import type { ReportIssue } from '../types';

/**
 * Module 9 · Local SEO audit (spec §16.2), one per website: 9.1 Business Profile completeness ·
 * 9.2 name, address and phone consistency (profile, website, listings) · 9.3 listings on the top
 * directories for the country · 9.4 reviews (count, rating, velocity, replies) · 9.5 posts, photos,
 * Q&A · 9.6 map pack ranking grid (5 × 5 points × 3 searches) · 9.7 location pages unique and 9.8
 * local schema (from the latest audit) · 9.9 local links (from the backlink audit) · 9.10 the
 * businesses that win the map pack across the grid.
 */
export type ProfileCheck = { id: string; label: string; ok: boolean; detail: string };
export type NapSource = { source: string; name: string | null; phone: string | null; address: string | null; nameOk: boolean | null; phoneOk: boolean | null; addressOk: boolean | null };
export type Citation = { site: string; label: string; found: boolean; url: string | null; phoneOk: boolean | null };
export type GridSearch = { search: string; ranks: (number | null)[]; average: number | null; top3: number; found: number };
export type Rival = { name: string; domain: string | null; top3: number; points: number; rating: number | null; reviews: number | null };
export type AuditLink = { ruleId: string; label: string; status: string; message: string };

export type LocalAudit = {
  domain: string;
  runAt: string;
  costUsd: number;
  businessName: string | null;
  profile: Profile | null;
  completeness: { score: number; checks: ProfileCheck[] } | null;
  nap: NapSource[];
  citations: Citation[];
  reviews: { total: number | null; rating: number | null; last90: number | null; perMonth: number | null; replyRate: number | null; latest: string | null; sample: number } | null;
  activity: { posts: number | null; posts90: number | null; latestPost: string | null; photos: number | null; questions: number | null; unanswered: number | null } | null;
  grid: { center: { lat: number; lng: number }; radiusKm: number; size: number; searches: GridSearch[] } | null;
  rivals: Rival[];
  fromAudit: AuditLink[];
  localLinks: { count: number; examples: string[] } | null;
  /** Reviews and posts are DataForSEO tasks; when they are not ready in time, they are read on the next visit. */
  pending: { reviews?: string; updates?: string };
  notes: string[];
};

export const LOCAL_GRID = { size: 5, searches: 3, radiusKm: 8, zoom: 13 } as const;
export const LOCAL_ESTIMATE_USD = 0.35;

const DIRECTORIES: Record<string, [string, string][]> = {
  'United States': [['yelp.com', 'Yelp'], ['bbb.org', 'BBB'], ['angi.com', 'Angi'], ['homeadvisor.com', 'HomeAdvisor'], ['yellowpages.com', 'Yellow Pages'], ['facebook.com', 'Facebook'], ['nextdoor.com', 'Nextdoor'], ['thumbtack.com', 'Thumbtack'], ['mapquest.com', 'MapQuest'], ['manta.com', 'Manta']],
  'United Kingdom': [['yell.com', 'Yell'], ['checkatrade.com', 'Checkatrade'], ['trustpilot.com', 'Trustpilot'], ['facebook.com', 'Facebook'], ['yelp.co.uk', 'Yelp'], ['thomsonlocal.com', 'Thomson Local'], ['freeindex.co.uk', 'FreeIndex'], ['bark.com', 'Bark'], ['scoot.co.uk', 'Scoot']],
  Canada: [['yelp.ca', 'Yelp'], ['yellowpages.ca', 'Yellow Pages'], ['bbb.org', 'BBB'], ['homestars.com', 'HomeStars'], ['facebook.com', 'Facebook'], ['canpages.ca', 'Canpages']],
  Australia: [['yellowpages.com.au', 'Yellow Pages'], ['truelocal.com.au', 'True Local'], ['hipages.com.au', 'hipages'], ['yelp.com.au', 'Yelp'], ['facebook.com', 'Facebook'], ['productreview.com.au', 'ProductReview'], ['oneflare.com.au', 'Oneflare']],
};
const DEFAULT_DIRECTORIES: [string, string][] = [['facebook.com', 'Facebook'], ['yelp.com', 'Yelp'], ['trustpilot.com', 'Trustpilot'], ['linkedin.com', 'LinkedIn'], ['foursquare.com', 'Foursquare']];
export const directoriesFor = (country: string) => DIRECTORIES[country] ?? DEFAULT_DIRECTORIES;

/** Last 10 digits, so "+1 (214) 555-0100" and "214.555.0100" compare equal. */
export const phoneKey = (p: string | null | undefined) => {
  const d = (p ?? '').replace(/\D/g, '');
  return d.length >= 7 ? d.slice(-10) : null;
};
const nameMatch = (a: string | null, b: string | null) => {
  if (!a || !b) return null;
  const x = normTerm(a).replace(/\b(llc|inc|ltd|limited|co|company|the)\b/g, '').trim();
  const y = normTerm(b).replace(/\b(llc|inc|ltd|limited|co|company|the)\b/g, '').trim();
  return Boolean(x && y && (x.includes(y) || y.includes(x)));
};
/** Addresses agree when the house number and the postcode (or the street words) agree. */
const addressMatch = (a: string | null, b: string | null) => {
  if (!a || !b) return null;
  const num = (s: string) => s.match(/\b\d{1,6}\b/)?.[0] ?? null;
  const zip = (s: string) => s.match(/\b\d{5}(?:-\d{4})?\b|\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b/i)?.[0]?.replace(/\s/g, '').toUpperCase() ?? null;
  const [na, nb, za, zb] = [num(a), num(b), zip(a), zip(b)];
  if (za && zb) return za === zb && (!na || !nb || na === nb);
  return na !== null && na === nb;
};

const isOwn = (d: string | null | undefined, domain: string) => Boolean(d) && (d === domain || d!.endsWith(`.${domain}`) || d!.replace(/^www\./, '') === domain);

/** 9.6 The 5 × 5 points around the business, `radiusKm` to each side. */
export function gridPoints(center: { lat: number; lng: number }, radiusKm: number, size: number): { lat: number; lng: number }[] {
  const half = (size - 1) / 2;
  const step = half ? radiusKm / half : 0;
  const out: { lat: number; lng: number }[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const dy = (half - r) * step;
      const dx = (c - half) * step;
      out.push({ lat: center.lat + dy / 111.32, lng: center.lng + dx / (111.32 * Math.cos((center.lat * Math.PI) / 180)) });
    }
  }
  return out;
}

/** 9.1 What a complete Business Profile has. */
export function completeness(p: Profile, domain: string): { score: number; checks: ProfileCheck[] } {
  const checks: ProfileCheck[] = [
    { id: 'claimed', label: 'Profile claimed', ok: p.claimed === true, detail: p.claimed === false ? 'Not claimed: anyone can suggest changes' : p.claimed ? 'Claimed' : 'Unknown' },
    { id: 'category', label: 'Main category', ok: Boolean(p.category), detail: p.category ?? 'Missing' },
    { id: 'extra', label: 'Extra categories', ok: p.extraCategories.length >= 1, detail: p.extraCategories.length ? p.extraCategories.slice(0, 4).join(', ') : 'None' },
    { id: 'description', label: 'Business description', ok: (p.description?.length ?? 0) >= 250, detail: p.description ? `${p.description.length} characters (aim for 250+)` : 'Missing' },
    { id: 'phone', label: 'Phone number', ok: Boolean(phoneKey(p.phone)), detail: p.phone ?? 'Missing' },
    { id: 'website', label: 'Website links to this site', ok: isOwn(p.domain, domain), detail: p.domain ?? 'No website on the profile' },
    { id: 'hours', label: 'Opening hours', ok: p.hours, detail: p.hours ? 'Set' : 'Missing' },
    { id: 'photos', label: 'Photos (10 or more)', ok: (p.photos ?? 0) >= 10, detail: `${p.photos ?? 0} photos` },
    { id: 'attributes', label: 'Attributes (3 or more)', ok: p.attributes >= 3, detail: `${p.attributes} set` },
    { id: 'logo', label: 'Logo or cover photo', ok: p.logo, detail: p.logo ? 'Set' : 'Missing' },
  ];
  return { score: Math.round((checks.filter((c) => c.ok).length / checks.length) * 100), checks };
}

export type LocalDeps = {
  client: Pick<LocalClient, 'maps' | 'profile' | 'postReviews' | 'getReviews' | 'postUpdates' | 'getUpdates' | 'questions' | 'listings'>;
  homepage: (url: string) => Promise<PageContent | null>;
  /** Waiting between task checks (shortened in tests). */
  wait?: (ms: number) => Promise<void>;
  /** How long to wait for reviews and posts before reading them on the next visit. */
  taskBudgetMs?: number;
};

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await fn(next);
  }));
}

export function reviewStats(reviews: { rating: number | null; date: string | null; answered: boolean }[], total: number | null, rating: number | null, now: Date): LocalAudit['reviews'] {
  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  const recent = reviews.filter((r) => r.date && r.date >= since);
  const dates = reviews.map((r) => r.date ?? '').filter(Boolean).sort();
  // The sample is the newest 100; if all of them are within 90 days the true count is at least that.
  return {
    total,
    rating,
    last90: reviews.length ? recent.length : null,
    perMonth: reviews.length ? Math.round((recent.length / 3) * 10) / 10 : null,
    replyRate: reviews.length ? Math.round((reviews.filter((r) => r.answered).length / reviews.length) * 100) : null,
    latest: dates[dates.length - 1] ?? null,
    sample: reviews.length,
  };
}

export function postStats(dates: string[], now: Date): { posts: number; posts90: number; latestPost: string | null } {
  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  const sorted = [...dates].sort();
  return { posts: dates.length, posts90: dates.filter((d) => d >= since).length, latestPost: sorted[sorted.length - 1] ?? null };
}

/** 9.7 / 9.8 Results the latest site audit already has. */
const AUDIT_RULES: [string, string][] = [['2.9.2', 'Location pages unique'], ['1.6.6', 'No near-duplicate pages'], ['1.11.1', 'Local business schema'], ['1.11.4', 'Business details match on the site']];

export async function runLocalAudit(
  input: {
    domain: string;
    businessName: string | null;
    locale: Locale;
    searches: string[];
    places: string[];
    issues?: ReportIssue[] | null;
    localLinkDomains?: string[] | null;
    radiusKm?: number;
  },
  deps: LocalDeps,
  now = new Date(),
): Promise<LocalAudit> {
  const { domain, locale } = input;
  const notes: string[] = [];
  let cost = 0;
  const wait = deps.wait ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const name = input.businessName?.trim() || null;
  const homeP = deps.homepage(`https://${domain}/`).catch(() => null);

  // Find the business on Google Maps: by name (or the domain's words), matched on its website.
  let found: MapsResult | null = null;
  try {
    const query = name ?? domain.split('.')[0]!.replace(/-/g, ' ');
    const r = await deps.client.maps(input.places[0] ? `${query} ${input.places[0]}` : query, locale);
    cost += r.cost;
    found = r.results.find((m) => isOwn(m.domain, domain)) ?? (name ? r.results.find((m) => nameMatch(m.title, name)) ?? null : null);
  } catch {
    notes.push('Google Maps could not be searched for the business.');
  }
  let profile: Profile | null = null;
  if (found?.cid) {
    try {
      const r = await deps.client.profile(found.cid, locale);
      cost += r.cost;
      profile = r.profile;
    } catch {
      notes.push('The Business Profile details could not be read.');
    }
  }
  if (!found) notes.push(`No Google Business Profile was found for ${name ?? domain}. Create or claim one: it is what shows in the map results.`);

  const cid = profile?.cid ?? found?.cid ?? null;
  const center = profile?.lat !== null && profile?.lat !== undefined && profile.lng !== null ? { lat: profile.lat, lng: profile.lng! } : found?.lat !== null && found?.lat !== undefined && found.lng !== null ? { lat: found.lat, lng: found.lng! } : null;
  const radiusKm = input.radiusKm ?? LOCAL_GRID.radiusKm;
  const searches = input.searches.slice(0, LOCAL_GRID.searches);
  const businessName = profile?.title ?? name;

  // Reviews and posts are tasks: set them first so they run while the grid is checked.
  const [reviewTask, updateTask] = cid
    ? await Promise.all([
        deps.client.postReviews(cid, locale).then((t) => ((cost += t.cost), t.id)).catch(() => null),
        deps.client.postUpdates(cid, locale).then((t) => ((cost += t.cost), t.id)).catch(() => null),
      ])
    : [null, null];

  const listingsQueries = businessName ? [`"${businessName}"`, ...(input.places[0] ? [`"${businessName}" ${input.places[0]}`] : [])] : [];
  const hits: ListingHit[] = [];
  const points = center ? gridPoints(center, radiusKm, LOCAL_GRID.size) : [];
  const ranks = new Map<string, (number | null)[]>(searches.map((s) => [s, points.map(() => null)]));
  const seen = new Map<string, Rival>();
  let qa: { total: number; unanswered: number } | null = null;
  let gridFailed = 0;

  await Promise.all([
    pool(listingsQueries, 2, async (q) => {
      try {
        const r = await deps.client.listings(q, locale);
        cost += r.cost;
        hits.push(...r.hits);
      } catch {
        notes.push('Some web listings could not be searched.');
      }
    }),
    cid ? deps.client.questions(cid, locale).then((r) => ((cost += r.cost), (qa = { total: r.total, unanswered: r.unanswered }))).catch(() => notes.push('Questions and answers could not be read.')) : Promise.resolve(),
    pool(searches.flatMap((s) => points.map((p, i) => ({ s, p, i }))), 10, async ({ s, p, i }) => {
      try {
        const r = await deps.client.maps(s, locale, { ...p, zoom: LOCAL_GRID.zoom });
        cost += r.cost;
        const mine = r.results.find((m) => (cid && m.cid === cid) || isOwn(m.domain, domain));
        ranks.get(s)![i] = mine?.position ?? null;
        for (const m of r.results.filter((x) => x.position <= 3 && x !== mine)) {
          const key = m.cid ?? m.title;
          const e = seen.get(key) ?? { name: m.title, domain: m.domain, top3: 0, points: 0, rating: m.rating, reviews: m.reviews };
          e.top3++;
          seen.set(key, e);
        }
      } catch {
        gridFailed++;
      }
    }),
  ]);
  if (gridFailed) notes.push(`${gridFailed} of ${searches.length * points.length} map checks did not answer.`);
  if (!searches.length) notes.push('Add searches under Competitors → Where to look (or research keywords) to build the map grid.');

  // Reviews and posts: wait a little, else read them on the next visit.
  const pending: LocalAudit['pending'] = {};
  const budget = deps.taskBudgetMs ?? 45_000;
  const started = Date.now();
  let reviews: LocalAudit['reviews'] = profile ? { total: profile.reviews, rating: profile.rating, last90: null, perMonth: null, replyRate: null, latest: null, sample: 0 } : null;
  let posts: { posts: number; posts90: number; latestPost: string | null } | null = null;
  let reviewsRead = !reviewTask;
  let postsRead = !updateTask;
  while (!(reviewsRead && postsRead)) {
    if (!reviewsRead) {
      const r = await deps.client.getReviews(reviewTask!).catch(() => null);
      if (r?.ready) {
        reviews = reviewStats(r.reviews, profile?.reviews ?? r.total, profile?.rating ?? null, now);
        reviewsRead = true;
      }
    }
    if (!postsRead) {
      const u = await deps.client.getUpdates(updateTask!).catch(() => null);
      if (u?.ready) {
        posts = postStats(u.dates, now);
        postsRead = true;
      }
    }
    if ((reviewsRead && postsRead) || Date.now() - started >= budget) break;
    await wait(5000);
  }
  if (!reviewsRead) pending.reviews = reviewTask!;
  if (!postsRead) pending.updates = updateTask!;

  const home = await homeP;
  const sitePhone = home ? schemaValues(home, 'telephone')[0] ?? phonesIn(home.fullText)[0] ?? null : null;
  const siteAddress = home ? [schemaValues(home, 'streetAddress')[0], schemaValues(home, 'postalCode')[0]].filter(Boolean).join(' ') || null : null;
  const siteName = home ? schemaValues(home, 'name')[0] ?? null : null;
  const ref = { name: profile?.title ?? name, phone: phoneKey(profile?.phone ?? sitePhone), address: profile?.address ?? siteAddress };
  const nap: NapSource[] = [];
  if (profile) nap.push({ source: 'Google Business Profile', name: profile.title, phone: profile.phone, address: profile.address, nameOk: true, phoneOk: true, addressOk: true });
  if (home) nap.push({ source: 'Your website', name: siteName, phone: sitePhone, address: siteAddress, nameOk: nameMatch(siteName, ref.name), phoneOk: sitePhone && ref.phone ? phoneKey(sitePhone) === ref.phone : null, addressOk: addressMatch(siteAddress, ref.address) });

  const dirs = directoriesFor(locale.country);
  const citations: Citation[] = dirs.map(([site, label]) => {
    const hit = hits.find((h) => h.domain === site || h.domain.endsWith(`.${site}`));
    const phone = hit ? phoneKey(phonesIn(`${hit.snippet ?? ''} ${hit.title ?? ''}`)[0] ?? null) : null;
    return { site, label, found: Boolean(hit), url: hit?.url ?? null, phoneOk: hit && phone && ref.phone ? phone === ref.phone : null };
  });
  for (const c of citations.filter((x) => x.found && x.phoneOk !== null)) nap.push({ source: c.label, name: null, phone: null, address: null, nameOk: null, phoneOk: c.phoneOk, addressOk: null });

  const gridSearches: GridSearch[] = searches.map((s) => {
    const r = ranks.get(s)!;
    const hitsR = r.filter((x): x is number => x !== null);
    return { search: s, ranks: r, average: hitsR.length ? Math.round((hitsR.reduce((a, b) => a + b, 0) / hitsR.length) * 10) / 10 : null, top3: hitsR.filter((x) => x <= 3).length, found: hitsR.length };
  });
  const total = searches.length * points.length || 1;
  const rivals = [...seen.values()].map((r) => ({ ...r, points: total })).sort((a, b) => b.top3 - a.top3).slice(0, 8);

  const fromAudit: AuditLink[] = AUDIT_RULES.flatMap(([id, label]) => {
    const i = input.issues?.find((x) => x.ruleId === id);
    return i ? [{ ruleId: id, label, status: i.status, message: i.message.client }] : [];
  });
  if (!input.issues) notes.push('Run an audit of the site to include location pages and local schema.');

  return {
    domain,
    runAt: now.toISOString(),
    costUsd: Math.round(cost * 10_000) / 10_000,
    businessName,
    profile,
    completeness: profile ? completeness(profile, domain) : null,
    nap,
    citations,
    reviews,
    activity: profile || qa || posts ? { posts: posts?.posts ?? null, posts90: posts?.posts90 ?? null, latestPost: posts?.latestPost ?? null, photos: profile?.photos ?? null, questions: (qa as { total: number } | null)?.total ?? null, unanswered: (qa as { unanswered: number } | null)?.unanswered ?? null } : null,
    grid: center && searches.length ? { center, radiusKm, size: LOCAL_GRID.size, searches: gridSearches } : null,
    rivals,
    fromAudit,
    localLinks: input.localLinkDomains ? { count: input.localLinkDomains.length, examples: input.localLinkDomains.slice(0, 10) } : null,
    pending,
    notes,
  };
}

/** Reads reviews and posts that were not ready during the run (called when the page is opened). */
export async function completePending(a: LocalAudit, client: Pick<LocalClient, 'getReviews' | 'getUpdates'>, now = new Date()): Promise<LocalAudit | null> {
  if (!a.pending.reviews && !a.pending.updates) return null;
  let next: LocalAudit = { ...a, pending: { ...a.pending } };
  let changed = false;
  if (a.pending.reviews) {
    const r = await client.getReviews(a.pending.reviews).catch(() => null);
    if (r?.ready) {
      next = { ...next, reviews: reviewStats(r.reviews, a.profile?.reviews ?? r.total, a.profile?.rating ?? null, now) };
      delete next.pending.reviews;
      changed = true;
    }
  }
  if (a.pending.updates) {
    const u = await client.getUpdates(a.pending.updates).catch(() => null);
    if (u?.ready) {
      const p = postStats(u.dates, now);
      next = { ...next, activity: { ...(next.activity ?? { photos: a.profile?.photos ?? null, questions: null, unanswered: null }), posts: p.posts, posts90: p.posts90, latestPost: p.latestPost } };
      delete next.pending.updates;
      changed = true;
    }
  }
  return changed ? next : null;
}
