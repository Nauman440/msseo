import { z } from 'zod';
import type { CompetitorAnalysis } from '../analysis/analysis';
import type { PageContent } from '../audit/page-content';
import { normTerm } from '../keywords/clean';
import type { KeywordWorkspace } from '../keywords/types';
import { normUrl, pathOf, pathWords, type MappingWorkspace } from '../mapping/mapping';
import type { OpenAiClient } from '../providers/openai';
import type { ReportPage } from '../types';

/**
 * Module 7 · Content audit and gap analysis (spec §16.2). 7.1 inventory with Search Console clicks
 * and impressions and GA4 key events per page · 7.2 keep / improve / merge / remove · 7.3 decay
 * (≥ 30% fewer clicks than the previous 90 days) · 7.4 topics competitors cover (Module 6) and
 * topics without a page (Module 5) · 7.5 service × place coverage · 7.6 pillar and cluster plan
 * (Module 4 topics under each service) · 7.7 quality check by AI (original, accurate, real
 * experience) · 7.8 content calendar with seasonal deadlines · 7.9 the brief template.
 * Costs nothing on DataForSEO: Google data, our own page fetches and OpenAI only.
 */
export type Verdict = 'keep' | 'improve' | 'merge' | 'remove';
export type InventoryRow = {
  url: string; title: string | null; words: number | null; pageType: string | null; inSitemapOnly: boolean;
  clicks: number | null; impressions: number | null; position: number | null; prevClicks: number | null; change: number | null;
  sessions: number | null; conversions: number | null; verdict: Verdict; reason: string;
};
export type TopicGap = { topic: string; source: 'competitors' | 'no-page'; detail: string };
export type CoverageCell = { service: string; place: string; url: string | null };
export type Pillar = { service: string; url: string | null; clusters: { topic: string; url: string | null; action: string }[] };
export type QualityRow = { url: string; original: number; accurate: number; experience: number; note: string };
export type CalendarItem = { month: string; topic: string; action: string; why: string; topicId: string };

export type ContentAudit = {
  domain: string;
  runAt: string;
  tokens: number;
  usedSearchConsole: boolean;
  usedAnalytics: boolean;
  inventory: InventoryRow[];
  counts: Record<Verdict, number>;
  decay: InventoryRow[];
  topicGap: TopicGap[];
  coverage: { services: string[]; places: string[]; cells: CoverageCell[] } | null;
  pillars: Pillar[];
  quality: QualityRow[];
  calendar: CalendarItem[];
  notes: string[];
};

export type ContentInput = {
  domain: string;
  pages: ReportPage[];
  sitemapOnly: string[];
  gscNow: { page: string; clicks: number; impressions: number; position: number }[] | null;
  gscPrev: { page: string; clicks: number }[] | null;
  ga4: { path: string; sessions: number; keyEvents: number }[] | null;
  /** Pages the audit found as near-duplicates (1.6.6 / 2.4.7). */
  duplicates: string[];
  keywords: KeywordWorkspace;
  mapping: MappingWorkspace | null;
  analysis: CompetitorAnalysis | null;
};

const SKIP_REMOVE = new Set(['home', 'contact', 'about', 'legal']);
const NOT_LANDING = new Set(['home', 'contact', 'about', 'legal', 'blog_post', 'blog_index', 'category']);
const SMALL = new Set(['in', 'of', 'to', 'a', 'an', 'and', 'the', 'for', 'my', 'me', 'on', 'at', 'or', 'by']);
// Two-letter words stay ("AC" repair is not "furnace" repair).
const words = (s: string) => normTerm(s).split(' ').filter((w) => w.length > 1 && !SMALL.has(w));
const has = (text: string, phrase: string) => {
  const w = words(phrase);
  const t = new Set(words(text));
  return w.length > 0 && w.every((x) => t.has(x) || t.has(x.replace(/s$/, '')) || t.has(`${x}s`));
};

/** 7.1–7.3 One row per page, with its verdict and why. */
export function classifyContent(input: ContentInput): InventoryRow[] {
  const now = new Map((input.gscNow ?? []).map((r) => [normUrl(r.page), r]));
  const prev = new Map<string, number>();
  for (const r of input.gscPrev ?? []) prev.set(normUrl(r.page), (prev.get(normUrl(r.page)) ?? 0) + r.clicks);
  const ga = new Map((input.ga4 ?? []).map((r) => [r.path.replace(/\/$/, '') || '/', r]));
  const dup = new Set(input.duplicates.map(normUrl));
  const competing = new Set((input.mapping?.rows ?? []).flatMap((r) => (r.conflictSettled && r.conflictPlan === 'merge' ? r.conflicts.map((c) => normUrl(c.url)) : [])));
  const plan = new Map((input.mapping?.rows ?? []).filter((r) => r.url).map((r) => [normUrl(r.url!), r]));
  const rows: { url: string; page: ReportPage | null }[] = [...input.pages.map((p) => ({ url: p.url, page: p })), ...input.sitemapOnly.map((u) => ({ url: u, page: null }))];
  return rows.map(({ url, page }): InventoryRow => {
    const key = normUrl(url);
    const g = now.get(key);
    const before = prev.has(key) ? prev.get(key)! : input.gscPrev ? 0 : null;
    const clicks = g?.clicks ?? (input.gscNow ? 0 : null);
    const change = before && clicks !== null && before >= 1 ? Math.round(((clicks - before) / before) * 100) : null;
    const path = pathOf(url).replace(/\/$/, '') || '/';
    const a = input.ga4 ? ga.get(path) ?? { sessions: 0, keyEvents: 0 } : null;
    const base = {
      url, title: page?.title ?? null, words: page?.words ?? null, pageType: page?.pageType ?? null, inSitemapOnly: !page,
      clicks, impressions: g?.impressions ?? (input.gscNow ? 0 : null), position: g ? Math.round(g.position * 10) / 10 : null, prevClicks: before, change,
      sessions: a?.sessions ?? null, conversions: a?.keyEvents ?? null,
    };
    const thin = page !== null && page.words < 300;
    const noTraffic = (clicks ?? 0) === 0 && (g?.impressions ?? 0) < 10 && (a?.sessions ?? 0) < 5;
    const mapped = plan.get(key);
    if (competing.has(key)) return { ...base, verdict: 'merge', reason: 'Competes with another page for the same searches: merge it into the main page' };
    if (dup.has(key)) return { ...base, verdict: 'merge', reason: 'Nearly the same text as another page' };
    if (thin && noTraffic && page && !SKIP_REMOVE.has(page.pageType ?? '') && input.gscNow) return { ...base, verdict: 'remove', reason: `${page.words} words and no visits: remove (redirect) or rewrite` };
    if (change !== null && change <= -30 && (before ?? 0) >= 20) return { ...base, verdict: 'improve', reason: `Clicks down ${-change}% on the previous 90 days` };
    if (thin && !noTraffic) return { ...base, verdict: 'improve', reason: `Gets visits but only ${page!.words} words: expand it` };
    if (thin && !input.gscNow && !SKIP_REMOVE.has(page!.pageType ?? '')) return { ...base, verdict: 'improve', reason: `Only ${page!.words} words: expand it (connect Search Console to see whether it gets visits)` };
    if (g && g.position > 3 && g.position <= 20 && g.impressions >= 100) return { ...base, verdict: 'improve', reason: `Shown ${g.impressions.toLocaleString('en-US')} times at #${Math.round(g.position)}: improve it to reach the top 3` };
    if (mapped && (mapped.action === 'expand' || mapped.action === 'optimise')) return { ...base, verdict: 'improve', reason: `Page plan: ${mapped.action === 'expand' ? 'expand the content' : 'optimise'} for “${mapped.primaryKeyword}”` };
    return { ...base, verdict: 'keep', reason: (a?.keyEvents ?? 0) > 0 ? `${a!.keyEvents} key events (leads) in 90 days` : clicks ? `${clicks} clicks in 90 days` : 'No problem found' };
  });
}

/** 7.5 Which service × place pairs have a page (title, H1 or address names both). */
export function coverage(services: string[], places: string[], pages: ReportPage[], sitemapOnly: string[]): ContentAudit['coverage'] {
  const s = services.slice(0, 8);
  const p = places.slice(0, 8);
  if (!s.length || !p.length) return null;
  // Only pages that can be a service or place page: the homepage, about, contact, blog and archives name everything.
  const texts = [...pages.filter((x) => !NOT_LANDING.has(x.pageType ?? '')).map((x) => ({ url: x.url, text: `${x.title ?? ''} ${x.h1 ?? ''} ${pathWords(x.url)}` })), ...sitemapOnly.map((u) => ({ url: u, text: pathWords(u) }))];
  const cells = s.flatMap((service) => p.map((place) => ({ service, place, url: texts.find((t) => has(t.text, service) && has(t.text, place))?.url ?? null })));
  return { services: s, places: p, cells };
}

/** 7.6 Each service as a pillar with the keyword topics about it as cluster pages. */
export function pillars(kw: KeywordWorkspace, mapping: MappingWorkspace | null, pages: ReportPage[]): Pillar[] {
  const rows = mapping?.rows ?? [];
  return kw.seeds.services.slice(0, 10).map((service) => {
    const pillarPage = pages.find((p) => has(`${p.title ?? ''} ${p.h1 ?? ''} ${pathWords(p.url)}`, service) && (p.pageType === 'service' || p.pageType === 'service_location'));
    const clusters = kw.clusters
      .filter((c) => has(c.head, service) || has(c.name, service))
      .slice(0, 12)
      .map((c) => {
        const r = rows.find((x) => x.clusterId === c.id);
        return { topic: c.name, url: r?.url ?? null, action: r ? (r.url ? r.action : 'create') : 'not mapped' };
      });
    return { service, url: pillarPage?.url ?? null, clusters };
  }).filter((p) => p.clusters.length > 0 || p.url);
}

/** 7.4 Topics to cover: sections competitors have (Module 6) and topics without a page (Module 5). */
export function topicGaps(analysis: CompetitorAnalysis | null, mapping: MappingWorkspace | null): TopicGap[] {
  const fromRivals = (analysis?.contentGap ?? []).flatMap((c) => (c.missing?.length ? [{ topic: c.topic, source: 'competitors' as const, detail: `Their pages also cover: ${c.missing.slice(0, 4).join(' · ')}` }] : !c.you ? [{ topic: c.topic, source: 'competitors' as const, detail: `${c.rivals.length} competitor ${c.rivals.length === 1 ? 'page ranks' : 'pages rank'} and you have no page` }] : []));
  const noPage = (mapping?.rows ?? []).filter((r) => !r.url).map((r) => ({ topic: r.topic, source: 'no-page' as const, detail: `${r.volume.toLocaleString('en-US')} searches a month, no page yet (${r.newPageNote ?? 'new page'})` }));
  const seen = new Set<string>();
  return [...fromRivals, ...noPage].filter((g) => (seen.has(g.topic) ? false : (seen.add(g.topic), true))).slice(0, 30);
}

/** 7.8 A month-by-month plan: seasonal topics before their deadline, then the rest by priority (4 a month). */
export function calendar(kw: KeywordWorkspace, mapping: MappingWorkspace | null, now = new Date(), perMonth = 4): CalendarItem[] {
  const month = (d: Date) => d.toISOString().slice(0, 7);
  const add = (m: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, 1));
  const work = (mapping?.rows ?? []).filter((r) => r.action !== 'leave' && r.status !== 'live' && r.status !== 'verified');
  const clusterOf = new Map(kw.clusters.map((c) => [c.id, c]));
  const slots = new Map<string, number>();
  const take = (m: string) => {
    for (let i = 0; i < 24; i++) {
      const key = month(add(i));
      if (key < m) continue;
      if ((slots.get(key) ?? 0) < perMonth) {
        slots.set(key, (slots.get(key) ?? 0) + 1);
        return key;
      }
    }
    return m;
  };
  const seasonal = work.filter((r) => clusterOf.get(r.clusterId)?.seasonalDeadline).sort((a, b) => clusterOf.get(a.clusterId)!.seasonalDeadline!.localeCompare(clusterOf.get(b.clusterId)!.seasonalDeadline!));
  const rest = work.filter((r) => !clusterOf.get(r.clusterId)?.seasonalDeadline).sort((a, b) => b.priority - a.priority);
  const label: Record<string, string> = { create: 'Write a new page', expand: 'Expand the page', optimise: 'Improve the page', merge: 'Merge the pages' };
  const out: CalendarItem[] = [];
  for (const r of seasonal) {
    const deadline = clusterOf.get(r.clusterId)!.seasonalDeadline!.slice(0, 7);
    // Written the month before its "live by" date (Module 4 sets that two months before the peak); now if that has passed.
    const start = month(new Date(Date.UTC(Number(deadline.slice(0, 4)), Number(deadline.slice(5, 7)) - 2, 1)));
    out.push({ month: take(start < month(now) ? month(now) : start), topic: r.topic, action: label[r.action] ?? r.action, why: `Live by ${deadline} (busy season)`, topicId: r.clusterId });
  }
  for (const r of rest) out.push({ month: take(month(now)), topic: r.topic, action: label[r.action] ?? r.action, why: `Priority ${r.priority}`, topicId: r.clusterId });
  return out.sort((a, b) => a.month.localeCompare(b.month)).slice(0, 36);
}

/** 7.9 The brief template writers fill in (Markdown). */
export const BRIEF_TEMPLATE = [
  '# Content brief: <topic>',
  '',
  '**Address:** /<folder>/<slug>/  ',
  '**Page type:** <service page / location page / article>  ',
  '**Main keyword:** <keyword> (title, H1, meta description, first paragraph)  ',
  '**Supporting keywords:** <3–6 keywords> (section headings and body)  ',
  '**Length:** <words> (the pages that rank now)',
  '',
  '## Title, H1 and meta description',
  '- Title (50–60 characters):',
  '- H1:',
  '- Meta description (140–160 characters, with a call to action):',
  '',
  '## Opening (40–80 words)',
  'Answer the search directly: what you do, where, and how to get a quote.',
  '',
  '## Sections (H2)',
  '- <section> — what it must cover',
  '',
  '## FAQ',
  '- <real customer question> — short direct answer',
  '',
  '## Must have',
  '- Real photos, prices or a price range, reviews, licences and guarantees, click-to-call and a short form',
  '- Links from: <related pages> · Links to: <service and area pages>',
  '- Schema: <Service / LocalBusiness / FAQPage / Article / BreadcrumbList>',
  '',
  '## Experience and facts',
  '- Who wrote it and why they know (technician, years, certifications)',
  '- Facts to check before publishing (prices, dates, regulations)',
  '',
].join('\n');

const qualitySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pages'],
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'original', 'accurate', 'experience', 'note'],
        properties: { id: { type: 'string' }, original: { type: 'integer' }, accurate: { type: 'integer' }, experience: { type: 'integer' }, note: { type: 'string' } },
      },
    },
  },
};
const qualityParse = z.object({ pages: z.array(z.object({ id: z.string(), original: z.number(), accurate: z.number(), experience: z.number(), note: z.string() })) });

/** 7.7 Quality by AI for the most important pages: only the page text is sent (no Google data). */
export async function qualityCheck(ai: OpenAiClient, pages: PageContent[], kind: string): Promise<{ rows: QualityRow[]; tokens: number }> {
  if (!pages.length) return { rows: [], tokens: 0 };
  const input = pages.map((p, i) => ({ id: String(i), url: p.url, title: p.title ?? '', text: p.text.slice(0, 2500) }));
  const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));
  const r = await ai.generateJson({
    name: 'content_quality',
    system:
      `You review website pages of a ${kind}. For each page score 1–5: original (not generic or copied-sounding), accurate (no claims that look wrong, outdated or vague), ` +
      'experience (shows real first-hand experience: specific jobs, photos mentioned, named people, local detail). Add one short practical note to improve it. Plain English.',
    user: JSON.stringify(input),
    jsonSchema: qualitySchema,
    parse: qualityParse,
    maxOutputTokens: 1500,
    timeoutMs: 60_000,
  });
  return {
    tokens: r.tokens,
    rows: r.data.pages.flatMap((x) => {
      const p = input.find((i) => i.id === x.id);
      return p ? [{ url: p.url, original: clamp(x.original), accurate: clamp(x.accurate), experience: clamp(x.experience), note: x.note.slice(0, 300) }] : [];
    }),
  };
}

export async function runContentAudit(input: ContentInput, deps: { pages?: (urls: string[]) => Promise<PageContent[]>; ai?: OpenAiClient | null; kind?: string }, now = new Date()): Promise<ContentAudit> {
  const notes: string[] = [];
  const inventory = classifyContent(input);
  const counts: Record<Verdict, number> = { keep: 0, improve: 0, merge: 0, remove: 0 };
  for (const r of inventory) counts[r.verdict]++;
  if (!input.gscNow) notes.push('Search Console is not connected for this site, so traffic, decay and "remove" suggestions are missing.');
  if (!input.ga4) notes.push('Google Analytics is not connected, so leads (key events) per page are missing.');
  if (!input.pages.length) notes.push('Run an audit of the site first: the inventory starts from its pages.');
  let quality: QualityRow[] = [];
  let tokens = 0;
  if (deps.ai && deps.pages && input.pages.length) {
    // Pages that win customers first (service and place pages), never jobs pages; then by clicks and length.
    const rank = (r: InventoryRow) => (/^(service|location|service_location)$/.test(r.pageType ?? '') ? 0 : 1);
    const top = [...inventory]
      .filter((r) => !r.inSitemapOnly && !SKIP_REMOVE.has(r.pageType ?? '') && !/\/(careers?|jobs?|employment|join-our-team)(\/|$)/i.test(pathOf(r.url)))
      .sort((a, b) => rank(a) - rank(b) || (b.clicks ?? 0) - (a.clicks ?? 0) || (b.words ?? 0) - (a.words ?? 0))
      .slice(0, 5);
    try {
      const fetched = (await deps.pages(top.map((t) => t.url))).filter((p) => p.status > 0 && p.status < 400 && p.words > 50);
      const q = await qualityCheck(deps.ai, fetched, deps.kind ?? 'local service business');
      quality = q.rows;
      tokens = q.tokens;
    } catch {
      notes.push('The AI quality check could not run this time.');
    }
  } else if (!deps.ai) notes.push('AI is not set up, so the quality check (original, accurate, real experience) was skipped.');
  return {
    domain: input.domain,
    runAt: now.toISOString(),
    tokens,
    usedSearchConsole: Boolean(input.gscNow),
    usedAnalytics: Boolean(input.ga4),
    inventory,
    counts,
    decay: inventory.filter((r) => r.change !== null && r.change <= -30 && (r.prevClicks ?? 0) >= 20).sort((a, b) => (a.change ?? 0) - (b.change ?? 0)),
    topicGap: topicGaps(input.analysis, input.mapping),
    coverage: input.keywords.businessType === 'shop' ? null : coverage(input.keywords.seeds.services, input.keywords.seeds.locations, input.pages, input.sitemapOnly),
    pillars: pillars(input.keywords, input.mapping, input.pages),
    quality,
    calendar: calendar(input.keywords, input.mapping, now),
    notes,
  };
}
