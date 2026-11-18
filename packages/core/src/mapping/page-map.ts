import { fetchPageContents, type PageContent } from '../audit/page-content';
import { normTerm } from '../keywords/clean';
import type { ReportPage } from '../types';
import { pathOf, titleCase, type MappingRow, type PageCheck, type Slot, type TopicKeyword } from './mapping';

/**
 * Module 5 · the keyword map for one page (design-reference/Keywords tab keyword map for one
 * page): where each of the topic's keywords should appear on the page, where it is now, and the
 * drafted fixes that close the gaps. Fixes go to the action plan (Module 12) for approval.
 */
export const SLOT_LABEL: Record<Slot, string> = {
  title: 'Title',
  h1: 'H1',
  meta: 'Meta description',
  first: 'First paragraph',
  heading: 'Section heading',
  body: 'Body',
  faq: 'FAQ',
  table: 'Price table',
};

const SMALL = new Set(['a', 'an', 'and', 'the', 'for', 'in', 'of', 'to', 'near', 'me', 'my', 'on', 'at', 'with', 'is', 'are', 'do', 'does', 'i', 'you', 'your']);
const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const words = (s: string) => normTerm(s).split(' ').filter((w) => w && !SMALL.has(w)).map(stem);
/** Every meaningful word of the keyword appears in the text (word order and plurals do not matter). */
export function mentions(text: string | null | undefined, term: string): boolean {
  const want = words(term);
  if (!want.length || !text) return false;
  const have = new Set(words(text));
  return want.every((w) => have.has(w));
}

const QUESTION = /^(how|what|why|when|where|which|who|can|does|do|is|are|should|will)\b|\?$|\bvs\b|\bversus\b/;
export const isQuestion = (term: string) => QUESTION.test(normTerm(term));
const isCost = (term: string) => /\b(cost|costs|price|prices|pricing|how much|rates?)\b/.test(normTerm(term));

/** What the page contains, plus where each keyword was found (kept on the row so the map shows without fetching again). */
export function checkPage(c: PageContent, terms: string[], now = new Date()): PageCheck {
  const headings = c.headings.filter((h) => h.level >= 2).map((h) => h.text).slice(0, 60);
  const faqHeading = c.headings.some((h) => /\b(faq|frequently asked|questions)\b/i.test(h.text));
  const questionHeadings = c.headings.filter((h) => /\?\s*$/.test(h.text)).map((h) => h.text);
  const found: Record<string, Slot[]> = {};
  for (const t of terms) {
    const s: Slot[] = [];
    if (mentions(c.title, t)) s.push('title');
    if (c.h1.some((h) => mentions(h, t))) s.push('h1');
    if (mentions(c.description, t)) s.push('meta');
    if (mentions(c.firstParagraph, t)) s.push('first');
    if (headings.some((h) => mentions(h, t))) s.push('heading');
    if ((c.faqMarkup || faqHeading) && questionHeadings.some((h) => mentions(h, t))) s.push('faq');
    if (mentions(c.text, t)) s.push('body');
    found[normTerm(t)] = s;
  }
  return {
    url: c.url,
    fetchedAt: now.toISOString(),
    status: c.status,
    title: c.title ?? null,
    h1: c.h1,
    meta: c.description ?? null,
    headings,
    firstParagraph: c.firstParagraph ?? null,
    faq: c.faqMarkup || faqHeading,
    tables: c.tables,
    words: c.words,
    found,
  };
}

/** Fetches the live page (8 s timeout) and checks it; null when it cannot be loaded. */
export async function fetchPageCheck(url: string, terms: string[], now = new Date()): Promise<PageCheck | null> {
  const [c] = await fetchPageContents([url]).catch(() => []);
  return c && c.status > 0 && c.status < 400 ? checkPage(c, terms, now) : null;
}

/** The check is missing, from another page, older than 7 days, or does not cover the topic's keywords yet. */
export function needsCheck(row: MappingRow, terms: string[], now = new Date()): boolean {
  const c = row.pageCheck;
  if (!row.url) return false;
  if (!c || c.url !== row.url) return true;
  if (now.getTime() - Date.parse(c.fetchedAt) > 7 * 86_400_000) return true;
  return terms.some((t) => !(normTerm(t) in c.found));
}

export type MapRole = 'main' | 'supporting';
export type MapRow = TopicKeyword & { role: MapRole; found: Slot[]; missing: Slot[]; shown: Slot[] };

/**
 * Where each keyword should appear: the main keyword in the title, H1, meta description and first
 * paragraph; the two most searched supporting keywords (and price searches) in a section heading;
 * questions in the FAQ; price searches next to a price table; the rest anywhere in the body.
 */
export function keywordMap(row: MappingRow, kws: TopicKeyword[], check: PageCheck | null, fallback?: ReportPage | null): MapRow[] {
  const main = kws.find((k) => normTerm(k.term) === normTerm(row.primaryKeyword)) ?? { term: row.primaryKeyword, volume: row.volume, position: row.currentPosition, url: row.url };
  const supporting = kws.filter((k) => k !== main).slice(0, 8);
  const topTwo = new Set([...supporting].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)).slice(0, 2).map((k) => k.term));
  const foundFor = (t: string): Slot[] => {
    if (check) return check.found[normTerm(t)] ?? [];
    // Without a page check only the audit's title and H1 are known.
    const s: Slot[] = [];
    if (mentions(fallback?.title, t)) s.push('title');
    if (mentions(fallback?.h1, t)) s.push('h1');
    return s;
  };
  const known = (s: Slot) => Boolean(check) || s === 'title' || s === 'h1';
  return [main, ...supporting].map((k): MapRow => {
    const role: MapRole = k === main ? 'main' : 'supporting';
    const found = foundFor(k.term);
    let want: Slot[];
    if (role === 'main') want = ['title', 'h1', 'meta', 'first'];
    else if (isQuestion(k.term)) want = ['faq'];
    else if (isCost(k.term)) want = ['heading', 'table'];
    else if (topTwo.has(k.term)) want = ['heading'];
    else want = ['body'];
    const has = (s: Slot) => (s === 'table' ? Boolean(check && check.tables > 0) : s === 'body' ? found.some((f) => f !== 'meta' && f !== 'title') : found.includes(s));
    const missing = want.filter((s) => known(s) && !has(s));
    // Show what is in place: the wanted spots that are covered, else the best spot it is in.
    const covered = want.filter((s) => s !== 'table' && has(s));
    const best = (['heading', 'faq', 'first', 'body'] as Slot[]).find((s) => found.includes(s));
    const shown = covered.length ? covered : best ? [best] : [];
    return { ...k, role, found, missing, shown };
  });
}

export type FixId = 'title' | 'h1' | 'meta' | 'intro' | 'section' | 'faq' | 'links' | 'schema' | 'retarget';
export type PageFix = {
  id: FixId;
  label: string;
  /** "Fixes: main keyword missing from title" */
  reason: string;
  now: string;
  suggested: string;
  /** "52 characters", "one H1", "drafted content" */
  note: string;
  /** Keywords this fix puts in place. */
  keywords: string[];
  /** Edited by hand. */
  edited: boolean;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Drafted fixes for one page, from the keyword map plus the page plan's links, schema and settled conflicts. */
export function pageFixes(
  row: MappingRow,
  map: MapRow[],
  check: PageCheck | null,
  ctx: { brand: string; place: string | null; questions?: { text: string; keyword: string }[]; fallback?: ReportPage | null },
): PageFix[] {
  if (!row.url) return [];
  const edits = row.edits ?? {};
  const main = map.find((m) => m.role === 'main');
  const fixes: PageFix[] = [];
  const add = (f: Omit<PageFix, 'edited' | 'suggested'> & { suggested: string }) => {
    const edited = typeof edits[f.id] === 'string' && edits[f.id] !== '';
    fixes.push({ ...f, suggested: edited ? edits[f.id]! : f.suggested, edited });
  };
  const nowTitle = check?.title ?? ctx.fallback?.title ?? null;
  const nowH1 = check ? check.h1 : ctx.fallback?.h1 ? [ctx.fallback.h1] : [];
  const kw = titleCase(row.primaryKeyword);
  const where = ctx.place && !normTerm(row.primaryKeyword).includes(normTerm(ctx.place)) ? ` in ${titleCase(ctx.place)}` : '';

  if (main?.missing.includes('title') && row.drafts) {
    add({ id: 'title', label: 'Title tag', reason: 'Fixes: main keyword missing from title', now: nowTitle ?? '(missing)', suggested: row.drafts.title, note: `${row.drafts.title.length} characters`, keywords: [main.term] });
  }
  if (row.drafts && (main?.missing.includes('h1') || (check && check.h1.length !== 1))) {
    const why = !nowH1.length ? 'Fixes: no H1 on the page' : nowH1.length > 1 ? `Fixes: ${nowH1.length} H1 headings, keep one` : 'Fixes: main keyword missing from H1';
    add({ id: 'h1', label: 'H1 heading', reason: why, now: nowH1.join(' · ') || '(missing)', suggested: row.drafts.h1, note: 'one H1', keywords: main ? [main.term] : [] });
  }
  if (check && main?.missing.includes('meta') && row.drafts) {
    add({ id: 'meta', label: 'Meta description', reason: check.meta ? 'Fixes: main keyword missing from description' : 'Fixes: no meta description', now: check.meta ?? '(missing)', suggested: row.drafts.meta, note: `${row.drafts.meta.length} characters`, keywords: [main.term] });
  }
  if (check && main?.missing.includes('first')) {
    add({
      id: 'intro',
      label: 'Opening paragraph',
      reason: 'Fixes: main keyword missing from the first paragraph',
      now: check.firstParagraph ? `${check.firstParagraph.slice(0, 160)}${check.firstParagraph.length > 160 ? '…' : ''}` : '(no opening paragraph)',
      suggested: `Start with 40 to 80 words that answer the search directly: ${ctx.brand} offers ${row.primaryKeyword}${where.toLowerCase()}, what is included, how fast you can help and how to get a quote.`,
      note: 'drafted content',
      keywords: [main.term],
    });
  }
  const forSection = map.filter((m) => m.role === 'supporting' && (m.missing.includes('heading') || m.missing.includes('table')));
  if (forSection.length) {
    const table = forSection.some((m) => m.missing.includes('table'));
    const h2 = forSection.slice(0, 3).map((m) => `H2 "${titleCase(m.term)}${ctx.place && !normTerm(m.term).includes(normTerm(ctx.place)) ? ` in ${titleCase(ctx.place)}` : ''}"`);
    add({
      id: 'section',
      label: 'New section',
      reason: `Fixes: ${forSection.map((m) => m.term).slice(0, 3).join(', ')}`,
      now: check && check.headings.length ? `${plural(check.headings.length, 'section heading')}, none for ${forSection.length === 1 ? 'this keyword' : 'these keywords'}` : 'No section for these keywords',
      suggested: `${h2.join(', ')}${table ? ', with a price range table' : ''}`,
      note: 'drafted content',
      keywords: forSection.map((m) => m.term),
    });
  }
  const forFaq = map.filter((m) => m.missing.includes('faq'));
  if (forFaq.length) {
    const paa = new Map((ctx.questions ?? []).map((q) => [normTerm(q.keyword), q.text]));
    const qs = forFaq.slice(0, 4).map((m) => {
      const real = paa.get(normTerm(m.term));
      if (real) return `Q: ${real}`;
      const t = normTerm(m.term);
      if (/\bvs\b|\bversus\b/.test(t)) {
        const [a, b] = t.split(/\s+(?:vs|versus)\s+/);
        return `Q: Should I get ${a ?? t} or ${b ?? 'something else'}${where.toLowerCase()}? A short direct answer`;
      }
      return `Q: ${m.term.charAt(0).toUpperCase()}${m.term.slice(1)}${/\?$/.test(m.term) ? '' : '?'} A short direct answer`;
    });
    add({ id: 'faq', label: 'FAQ entry', reason: `Fixes: ${forFaq.map((m) => m.term).slice(0, 3).join(', ')}`, now: check?.faq ? 'FAQ without these questions' : 'No FAQ on this page', suggested: qs.join('\n'), note: 'drafted content', keywords: forFaq.map((m) => m.term) });
  }
  if (row.linksToAdd.length) {
    add({
      id: 'links',
      label: 'Internal links',
      reason: `Fixes: ${plural(row.linksToAdd.length, 'related page')} not linking here`,
      now: 'No link from these pages',
      suggested: row.linksToAdd.map((l) => `${pathOf(l.from)} → link "${l.anchor}"`).join('\n'),
      note: plural(row.linksToAdd.length, 'link'),
      keywords: [row.primaryKeyword],
    });
  }
  if (row.schemaNeeded.length) {
    add({ id: 'schema', label: 'Schema markup', reason: 'Fixes: structured data missing for this page type', now: 'Not on the page', suggested: `Add ${row.schemaNeeded.join(', ')}`, note: plural(row.schemaNeeded.length, 'type'), keywords: [] });
  }
  if (row.conflictSettled && row.conflictPlan === 'differentiate' && row.conflicts.length) {
    add({
      id: 'retarget',
      label: 'Other page',
      reason: 'Fixes: two pages competing for this topic',
      now: row.conflicts.map((c) => pathOf(c.url)).join(', '),
      suggested: `Give ${row.conflicts.length === 1 ? 'that page' : 'those pages'} a different keyword (a question or guide angle) in the title and H1, and link to ${pathOf(row.url)} with the anchor "${row.primaryKeyword}"`,
      note: 'needs your approval',
      keywords: [],
    });
  }
  if (row.conflictSettled && row.conflictPlan === 'merge' && row.conflicts.length) {
    add({
      id: 'retarget',
      label: 'Merge',
      reason: 'Fixes: two pages competing for this topic',
      now: row.conflicts.map((c) => pathOf(c.url)).join(', '),
      suggested: `Move the useful content into ${pathOf(row.url)}, then redirect (301) ${row.conflicts.map((c) => pathOf(c.url)).join(', ')} to it`,
      note: 'needs your approval',
      keywords: [],
    });
  }
  return fixes;
}

/** Count of gaps (missing spots) on the map. */
export const gapCount = (map: MapRow[]) => map.reduce((s, m) => s + m.missing.length, 0);

/** 5.3 + "generate page briefs": everything a writer needs for a new page. */
export type PageBrief = {
  topic: string;
  path: string;
  pageType: string;
  note: string;
  title: string;
  h1: string;
  meta: string;
  mainKeyword: string;
  supporting: string[];
  outline: string[];
  faq: string[];
  mustHave: string[];
  linksFrom: string[];
  schema: string[];
  words: string;
};

const PAGE_TYPE_LABEL: Record<string, string> = {
  home: 'Homepage', service: 'Service page', location: 'Location page', service_location: 'Service page for one area', blog_post: 'Article',
  directory: 'Comparison page', product: 'Product page', category: 'Category page',
};
const WORDS: Record<string, string> = { service: '800 to 1,200', service_location: '700 to 1,000', location: '600 to 900', blog_post: '1,200 to 1,800', product: '300 to 600', category: '300 to 500', home: '700 to 1,000', directory: '1,000 to 1,500' };
const MUST_HAVE: Record<string, string[]> = {
  service: ['Click-to-call button and a short quote form near the top', 'Prices or a price range', 'Reviews from customers for this service', 'Licences, insurance and guarantees', 'Areas you serve'],
  service_location: ['Click-to-call button and a short quote form near the top', 'Local reviews and jobs done in this area', 'Prices or a price range', 'Licences, insurance and guarantees'],
  location: ['The services you offer in this area, each linked', 'Local reviews and photos of jobs here', 'Address or service-area details and a map', 'Click-to-call button'],
  blog_post: ['A 40 to 80 word answer right under the H1', 'Author name and credentials', 'Steps, a list or a table', 'A link to the matching service page'],
  product: ['Photos from several angles', 'Price, sizes or options and delivery details', 'Reviews', 'Returns and guarantees'],
  category: ['A short intro (2 to 3 sentences) above the products', 'Filters that do not create new indexable addresses', 'Links to the most popular products'],
};

export function pageBrief(row: MappingRow, kws: TopicKeyword[], ctx: { brand: string; place: string | null; questions?: { text: string; keyword: string }[]; rivalWords?: number[] }): PageBrief {
  const type = row.newPageType ?? 'service';
  const supporting = kws.filter((k) => normTerm(k.term) !== normTerm(row.primaryKeyword)).map((k) => k.term).slice(0, 8);
  const terms = new Set([row.primaryKeyword, ...supporting].map(normTerm));
  const paa = (ctx.questions ?? []).filter((q) => terms.has(normTerm(q.keyword))).map((q) => q.text);
  const asked = supporting.filter(isQuestion).map((t) => `${t.charAt(0).toUpperCase()}${t.slice(1)}${/\?$/.test(t) ? '' : '?'}`);
  const outline = [
    ...supporting.filter((t) => !isQuestion(t)).slice(0, 4).map((t) => titleCase(t)),
    ...(supporting.some(isCost) || /cost|price/.test(normTerm(row.primaryKeyword)) ? ['What it costs (price range table)'] : []),
    ...(type === 'blog_post' ? [] : ['Why choose us', 'Frequently asked questions']),
  ];
  const r = ctx.rivalWords?.filter((n) => n > 0).sort((a, b) => a - b) ?? [];
  const words = r.length ? `${r[0]!.toLocaleString('en-US')} to ${r[r.length - 1]!.toLocaleString('en-US')} (the pages ranking now)` : WORDS[type] ?? '800 to 1,200';
  return {
    topic: row.topic,
    path: row.suggestedPath ?? '/new-page/',
    pageType: PAGE_TYPE_LABEL[type] ?? 'Page',
    note: row.newPageNote ?? '',
    title: row.drafts?.title ?? '',
    h1: row.drafts?.h1 ?? '',
    meta: row.drafts?.meta ?? '',
    mainKeyword: row.primaryKeyword,
    supporting,
    outline: [...new Set(outline)],
    faq: [...new Set([...paa, ...asked])].slice(0, 6),
    mustHave: MUST_HAVE[type] ?? MUST_HAVE.service!,
    linksFrom: row.linksToAdd.map((l) => l.from),
    schema: row.schemaNeeded,
    words,
  };
}

export function briefToMarkdown(b: PageBrief, domain: string): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (none)');
  return [
    `# Page brief: ${b.topic}`,
    '',
    `**Website:** ${domain}  `,
    `**Address:** ${b.path}  `,
    `**Page type:** ${b.pageType}${b.note ? ` (${b.note})` : ''}  `,
    `**Length:** ${b.words} words`,
    '',
    '## Keywords',
    `- Main: **${b.mainKeyword}** (title, H1, meta description and the first paragraph)`,
    ...b.supporting.map((s) => `- Supporting: ${s}`),
    '',
    '## Title, H1 and meta description',
    `- Title: ${b.title}`,
    `- H1: ${b.h1}`,
    `- Meta description: ${b.meta}`,
    '',
    '## Outline (H2 sections)',
    list(b.outline),
    '',
    '## FAQ questions',
    list(b.faq),
    '',
    '## Must have on the page',
    list(b.mustHave),
    '',
    '## Link to this page from',
    list(b.linksFrom),
    '',
    '## Schema',
    list(b.schema),
    '',
  ].join('\n');
}
