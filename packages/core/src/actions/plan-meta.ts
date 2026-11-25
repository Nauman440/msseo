import { z } from 'zod';
import { dedupeKey } from '../keywords/clean';
import type { OpenAiClient } from '../providers/openai';

/**
 * Bug fix 2026-11-25: drafted titles and meta descriptions made good pages worse ("British-made dry dog food
 * from MAXBOX: grain-free Signature 80 with 80% animal ingredients…" became "Explore dry dog food recipes…").
 * Every draft is checked in code before it is saved:
 *  - KEEP: a current title/description that already passes the rules stays ("keep"), whatever the draft says.
 *  - Titles: 50–60 characters including the CMS suffix, main keyword near the start, brand once, unique.
 *  - Descriptions: 140–155 characters, a complete sentence, no "&amp;" or broken text, at least one concrete
 *    fact, no filler opening (Explore, Browse, Discover, Find, Learn, Check), unique.
 *  - Facts in the current text ("British-made", "80%", a price, a size) are never dropped.
 * Failing drafts go back to the model once with their errors; if they still fail, the current text stays and
 * the page is flagged for a person to review.
 */
export const TITLE_LEN = [50, 60] as const;
export const META_LEN = [140, 155] as const;
const KEEP = (v: string) => !v.trim() || v.trim().toLowerCase() === 'keep';

export type MetaRow = { url: string; title: string; description: string };
export type MetaPage = { url: string; title: string | null; description: string | null; mainKeyword: string | null };
export type MetaContext = { suffix: string | null; brand: string | null };
export type MetaReview = { url: string; field: 'title' | 'description'; problems: string[] };

const FILLER = /^(explore|browse|discover|find|learn|check)\b/i;
const BROKEN = /&amp;|&#\d+;|&[a-z]+;|�|\s{2,}|\|\s*\||(\.\.\.|…)\s*$|\{\{|\}\}/i;
const FACT = /\d|%|[£$€]|\b(british|english|scottish|welsh|irish|uk|american|italian|french|german|local)[- ]made\b|\bmade in\b|\bhand[- ]?made\b|\bgrain[- ]free\b|\borganic\b|\bvegan\b|\bhypoallergenic\b|\bnatural\b|\bfree (delivery|shipping|returns)\b|\bnext[- ]day\b|\bdelivery\b|\bingredients?\b|\bguarantee[d]?\b|\bwarranty\b|\bcertified\b|\blicen[cs]ed\b|\binsured\b|\baward/i;
/** Facts worth keeping word for word: percentages, prices, sizes, origin, key claims. */
const FACT_TOKENS = [
  /\d+(?:\.\d+)?\s?%/g, /[£$€]\s?\d[\d,]*(?:\.\d+)?/g, /\b\d+(?:\.\d+)?\s?(?:kg|g|mg|ml|l|cm|mm|m|in|inch(?:es)?|years?|months?)\b/gi,
  /\b(?:british|english|scottish|welsh|irish|uk|american|italian|french|german|local)[- ]made\b/gi, /\bmade in (?:the )?[a-z][a-z ]{1,20}?\b(?=[,.;:]|\s(?:with|from|and)\b|$)/gi,
  /\bgrain[- ]free\b/gi, /\bhand[- ]?made\b/gi, /\borganic\b/gi, /\bvegan\b/gi, /\bhypoallergenic\b/gi, /\b(?:free|next[- ]day) delivery\b/gi,
];
const squash = (s: string) => s.toLowerCase().replace(/[-\s]+/g, ' ').trim();

export function factsIn(text: string | null): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const re of FACT_TOKENS) for (const m of text.matchAll(re)) out.add(squash(m[0]));
  return [...out];
}

/** The title as it shows in Google: with the CMS suffix when the title does not end with it already. */
export function renderedTitle(title: string, suffix: string | null): string {
  if (!suffix) return title.trim();
  return title.trim().toLowerCase().endsWith(suffix.trim().toLowerCase()) ? title.trim() : `${title.trim()}${suffix}`;
}

const brandWord = (ctx: MetaContext) => (ctx.brand ?? ctx.suffix?.replace(/^\s*[|–—-]\s*/, '') ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';

function keywordNearStart(text: string, keyword: string | null): boolean {
  if (!keyword) return true;
  const words = dedupeKey(keyword).split(' ').filter((w) => w.length > 2);
  if (!words.length) return true;
  const have = dedupeKey(text).split(' ');
  if (!words.every((w) => have.includes(w))) return false;
  const lower = text.toLowerCase();
  const first = Math.min(...words.map((w) => { const i = lower.indexOf(w.slice(0, Math.max(3, w.length - 1))); return i < 0 ? Infinity : i; }));
  return first <= 30;
}

export function titleProblems(title: string, page: Pick<MetaPage, 'mainKeyword'>, ctx: MetaContext, others: Set<string>): string[] {
  const shown = renderedTitle(title, ctx.suffix);
  const p: string[] = [];
  if (shown.length < TITLE_LEN[0] || shown.length > TITLE_LEN[1]) p.push(`title is ${shown.length} characters with the suffix (needs ${TITLE_LEN[0]}–${TITLE_LEN[1]})`);
  if (!keywordNearStart(title, page.mainKeyword)) p.push(`main keyword "${page.mainKeyword}" is not near the start`);
  const brand = brandWord(ctx);
  if (brand.length > 2 && (shown.toLowerCase().match(new RegExp(`\\b${brand.replace(/[^a-z0-9]/g, '')}\\b`, 'g')) ?? []).length > 1) p.push('brand appears twice');
  if (BROKEN.test(shown)) p.push('broken or encoded text');
  if (others.has(shown.toLowerCase())) p.push('same title as another page');
  return p;
}

export function metaProblems(desc: string, ctx: { others: Set<string> }): string[] {
  const d = desc.trim();
  const p: string[] = [];
  if (d.length < META_LEN[0] || d.length > META_LEN[1]) p.push(`description is ${d.length} characters (needs ${META_LEN[0]}–${META_LEN[1]})`);
  if (!/[.!?]$/.test(d)) p.push('not a complete sentence');
  if (BROKEN.test(d)) p.push('broken or encoded text (e.g. "&amp;")');
  if (FILLER.test(d)) p.push('starts with a filler verb (Explore, Browse, Discover, Find, Learn, Check)');
  if (!FACT.test(d)) p.push('no concrete fact (ingredient, %, size, price, origin or delivery)');
  if (ctx.others.has(d.toLowerCase())) p.push('same description as another page');
  return p;
}

/** Facts of the current title and description that the new text (title + description together) lost. */
export function droppedFacts(current: string, next: string): string[] {
  const have = squash(next);
  return factsIn(current).filter((f) => !have.includes(f));
}

type Verdict = { row: MetaRow; failed: { field: 'title' | 'description'; problems: string[] }[] };

/** Applies the rules to one batch of drafts: keeps good current text, accepts good drafts, lists the rest. */
export function judgeMeta(rows: MetaRow[], pages: Map<string, MetaPage>, ctx: MetaContext): Verdict[] {
  const titles = new Map<string, number>();
  const descs = new Map<string, number>();
  const count = (m: Map<string, number>, v: string | null | undefined) => v && m.set(v.trim().toLowerCase(), (m.get(v.trim().toLowerCase()) ?? 0) + 1);
  for (const p of pages.values()) {
    count(titles, p.title ? renderedTitle(p.title, ctx.suffix) : null);
    count(descs, p.description);
  }
  for (const r of rows) {
    if (!KEEP(r.title)) count(titles, renderedTitle(r.title, ctx.suffix));
    if (!KEEP(r.description)) count(descs, r.description);
  }
  // "Others" = every title/description on the site except this one value once.
  const othersOf = (m: Map<string, number>, own: string | null | undefined) => {
    const set = new Set<string>();
    for (const [k, n] of m) if (n > 1 || k !== own?.trim().toLowerCase()) set.add(k);
    return set;
  };
  return rows.map((r) => {
    const page = pages.get(r.url) ?? { url: r.url, title: null, description: null, mainKeyword: null };
    const row: MetaRow = { url: r.url, title: r.title, description: r.description };
    const failed: Verdict['failed'] = [];
    const curTitleOk = page.title ? !titleProblems(page.title, page, ctx, othersOf(titles, renderedTitle(page.title, ctx.suffix))).length : false;
    if (curTitleOk) row.title = 'keep';
    else if (KEEP(r.title)) failed.push({ field: 'title', problems: page.title ? titleProblems(page.title, page, ctx, othersOf(titles, renderedTitle(page.title, ctx.suffix))) : ['page has no title'] });
    else {
      const pr = [...titleProblems(r.title, page, ctx, othersOf(titles, renderedTitle(r.title, ctx.suffix))), ...droppedFacts(page.title ?? '', `${r.title} ${r.description}`).map((f) => `drops the fact "${f}"`)];
      if (pr.length) failed.push({ field: 'title', problems: pr });
    }
    const curMetaOk = page.description ? !metaProblems(page.description, { others: othersOf(descs, page.description) }).length : false;
    if (curMetaOk) row.description = 'keep';
    else if (KEEP(r.description)) failed.push({ field: 'description', problems: page.description ? metaProblems(page.description, { others: othersOf(descs, page.description) }) : ['page has no meta description'] });
    else {
      const pr = [...metaProblems(r.description, { others: othersOf(descs, r.description) }), ...droppedFacts(page.description ?? '', `${r.title} ${r.description}`).map((f) => `drops the fact "${f}"`)];
      if (pr.length) failed.push({ field: 'description', problems: pr });
    }
    return { row, failed };
  });
}

const fixZ = z.object({ rows: z.array(z.object({ url: z.string(), title: z.string(), description: z.string() })) });
const FIX_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['rows'],
  properties: { rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['url', 'title', 'description'], properties: { url: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } } } } },
};
const FIX_SYSTEM = `You fix SEO titles and meta descriptions that failed checks. For each row, rewrite only the failing field(s); write "keep" for a field that has no errors.
Title: ${TITLE_LEN[0]}–${TITLE_LEN[1]} characters including the CMS suffix, main keyword near the start, brand only once, unique.
Meta description: ${META_LEN[0]}–${META_LEN[1]} characters, one or two complete sentences ending with a full stop, no "&amp;", at least one concrete fact from the page (ingredient, %, size, price, origin or delivery), never starting with Explore, Browse, Discover, Find, Learn or Check, unique.
Keep every fact the current text has (e.g. "British-made", "80% animal ingredients", a price). Never make the text more generic. Answer in the JSON schema, one row per url.`;

/**
 * Runs the rules, re-asks the model once for the drafts that failed, and keeps the current text (flagged for
 * review) for anything that still fails.
 */
export async function settlePageMeta(client: OpenAiClient | null, rows: MetaRow[], pages: Map<string, MetaPage>, ctx: MetaContext): Promise<{ rows: MetaRow[]; review: MetaReview[]; tokens: number; kept: number; fixed: number }> {
  let verdicts = judgeMeta(rows, pages, ctx);
  const kept = verdicts.reduce((n, v, i) => n + Number(v.row.title === 'keep' && !KEEP(rows[i]!.title)) + Number(v.row.description === 'keep' && !KEEP(rows[i]!.description)), 0);
  let tokens = 0;
  let fixed = 0;
  const failing = verdicts.filter((v) => v.failed.length);
  if (client && failing.length) {
    try {
      const user = JSON.stringify({
        cms_title_suffix: ctx.suffix ?? 'none',
        rows: failing.map((v) => {
          const p = pages.get(v.row.url);
          return { url: v.row.url, main_keyword: p?.mainKeyword ?? null, current_title: p?.title ?? null, current_description: p?.description ?? null, draft_title: v.row.title, draft_description: v.row.description, errors: v.failed.map((f) => `${f.field}: ${f.problems.join('; ')}`), facts_to_keep: factsIn(`${p?.title ?? ''} ${p?.description ?? ''}`) };
        }),
      });
      const r = await client.generateJson({ system: FIX_SYSTEM, user, name: 'page_meta_fix', jsonSchema: FIX_SCHEMA, parse: fixZ, maxOutputTokens: 16_000, timeoutMs: 5 * 60_000 });
      tokens += r.tokens;
      const answers = new Map(r.data.rows.map((x) => [x.url, x]));
      const retried = failing.map((v) => {
        const a = answers.get(v.row.url);
        const bad = new Set(v.failed.map((f) => f.field));
        return { url: v.row.url, title: a && bad.has('title') ? a.title : v.row.title, description: a && bad.has('description') ? a.description : v.row.description };
      });
      const again = new Map(judgeMeta(retried, pages, ctx).map((v) => [v.row.url, v]));
      verdicts = verdicts.map((v) => {
        const n = again.get(v.row.url);
        if (!n) return v;
        fixed += v.failed.length - n.failed.length;
        return n;
      });
    } catch {
      // The re-ask is a second chance only: on failure the current text stays and the page is flagged.
    }
  }
  const review: MetaReview[] = [];
  const out = verdicts.map((v) => {
    const row = { ...v.row };
    for (const f of v.failed) {
      if (f.field === 'title') row.title = 'keep';
      else row.description = 'keep';
      review.push({ url: row.url, field: f.field, problems: f.problems });
    }
    return row;
  });
  return { rows: out, review, tokens, kept, fixed };
}
