import { z } from 'zod';
import type { OpenAiClient } from '../providers/openai';
import type { BusinessProfile } from './quality';

/**
 * The model calls of phase 3. Each returns drafts only; the caller checks them (quality.ts) and
 * asks again once with the problems listed.
 */
const RULES_META =
  'Titles: 50–60 characters in total including any site suffix you are told about, main keyword near the start, the brand at most once, unique. ' +
  'Descriptions: 140–155 characters, one or two complete sentences ending with a full stop, one concrete fact that is on the page (a place served, a number, a named service), ' +
  'a benefit and a call to action, no first word Explore/Browse/Discover/Find/Learn/Check, no HTML entities, unique. ' +
  'Never drop a true fact from the current text (origin, %, price, size, place). No guarantees, medical or legal claims, no competitor names.';

const metaSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pages'],
  properties: {
    pages: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['url', 'title', 'description'], properties: { url: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } } },
    },
  },
} as const;
const metaParse = z.object({ pages: z.array(z.object({ url: z.string(), title: z.string(), description: z.string() })) });

export type MetaAsk = {
  url: string;
  name: string;
  mainKeyword: string | null;
  currentTitle: string | null;
  currentDescription: string | null;
  excerpt: string;
  /** Fields to write ("title", "description"), with the problems of the last draft when re-asking. */
  want: { title?: string[]; description?: string[] };
};

/** New titles and/or descriptions for a batch of pages. Fields not wanted come back as "". */
export async function draftMeta(ai: OpenAiClient, pages: MetaAsk[], profile: BusinessProfile, suffix: string | null): Promise<{ drafts: Map<string, { title: string; description: string }>; tokens: number }> {
  const r = await ai.generateJson({
    name: 'page_meta',
    system:
      `You write SEO titles and meta descriptions for ${profile.name}. ${RULES_META} ` +
      (suffix ? `The site adds "${suffix}" after every title automatically: do not repeat it, and count it in the 50–60. ` : 'Write the full title as it should appear. ') +
      'Only write the fields asked for; return "" for the others. When problems of an earlier draft are listed, fix every one.' +
      (profile.bannedWords.length ? ` Never use: ${profile.bannedWords.join(', ')}.` : ''),
    user: JSON.stringify(pages.map((p) => ({
      url: p.url, page_name: p.name, main_keyword: p.mainKeyword, current_title: p.currentTitle, current_description: p.currentDescription,
      page_text: p.excerpt.slice(0, 1200), write: Object.keys(p.want), earlier_problems: p.want,
    }))),
    jsonSchema: metaSchema as unknown as Record<string, unknown>,
    parse: metaParse,
    maxOutputTokens: 2500,
    timeoutMs: 120_000,
  });
  return { drafts: new Map(r.data.pages.map((p) => [p.url, { title: p.title.trim(), description: p.description.trim() }])), tokens: r.tokens };
}

const blockSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'faq'],
  properties: {
    answer: { type: 'string' },
    faq: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } },
  },
} as const;
const blockParse = z.object({ answer: z.string(), faq: z.array(z.object({ q: z.string(), a: z.string() })) });

/**
 * A direct answer (40–60 words) and/or 3–5 FAQs for one page, using only facts on the page or in the
 * business profile.
 */
export async function draftBlock(ai: OpenAiClient, p: { kind: 'answer' | 'faq'; url: string; name: string; mainKeyword: string | null; text: string; problems: string[] }, profile: BusinessProfile): Promise<{ answer: string; faq: { q: string; a: string }[]; tokens: number }> {
  const r = await ai.generateJson({
    name: 'content_block',
    system:
      `You write short, factual page blocks for ${profile.name}. Use ONLY facts in the page text or the profile; never invent numbers, prices, years, certifications or results. ` +
      'No guarantees, medical or legal claims, no competitor names, plain English. ' +
      (p.kind === 'answer'
        ? 'Write "answer": a direct answer of 40–60 words to the question the page answers (what the business does here, for whom, where). Return faq as [].'
        : 'Write "faq": 3–5 questions customers ask about this page\'s topic, each answered in 1–3 sentences from the page text. Return answer as "".') +
      (p.problems.length ? ` Fix these problems of your earlier draft: ${p.problems.join('; ')}.` : '') +
      (profile.bannedWords.length ? ` Never use: ${profile.bannedWords.join(', ')}.` : ''),
    user: JSON.stringify({ page: p.name, url: p.url, main_keyword: p.mainKeyword, places: profile.places, page_text: p.text.slice(0, 4000) }),
    jsonSchema: blockSchema as unknown as Record<string, unknown>,
    parse: blockParse,
    maxOutputTokens: 1200,
    timeoutMs: 90_000,
  });
  return { answer: r.data.answer.trim(), faq: r.data.faq, tokens: r.tokens };
}

const h1Schema = { type: 'object', additionalProperties: false, required: ['pages'], properties: { pages: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['url', 'h1'], properties: { url: { type: 'string' }, h1: { type: 'string' } } } } } } as const;
const h1Parse = z.object({ pages: z.array(z.object({ url: z.string(), h1: z.string() })) });

/** A new main heading (H1) for each page: what the page offers, with its main keyword, in plain words. */
export async function draftH1(ai: OpenAiClient, pages: { url: string; name: string; mainKeyword: string | null; currentH1: string | null; title: string | null; excerpt: string; problems: string[] }[], profile: BusinessProfile): Promise<{ drafts: Map<string, string>; tokens: number }> {
  const r = await ai.generateJson({
    name: 'page_h1',
    system:
      `You write the main heading (H1) of web pages for ${profile.name}. Each H1 is 20–65 characters, says plainly what the page offers, ` +
      'starts with or contains the main keyword (natural wording, no stuffing), is not just the business name, has no "|" or emoji, ' +
      'and differs from the title tag. Use only facts on the page; no guarantees, medical or legal claims, no competitor names. ' +
      'When problems of an earlier draft are listed, fix every one.' + (profile.bannedWords.length ? ` Never use: ${profile.bannedWords.join(', ')}.` : ''),
    user: JSON.stringify(pages.map((p) => ({ url: p.url, page_name: p.name, main_keyword: p.mainKeyword, current_h1: p.currentH1, title_tag: p.title, page_text: p.excerpt.slice(0, 1000), earlier_problems: p.problems }))),
    jsonSchema: h1Schema as unknown as Record<string, unknown>,
    parse: h1Parse,
    maxOutputTokens: 1500,
    timeoutMs: 120_000,
  });
  return { drafts: new Map(r.data.pages.map((p) => [p.url, p.h1.trim()])), tokens: r.tokens };
}

const sectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['heading', 'paragraphs', 'bullets', 'table'],
  properties: {
    heading: { type: 'string' },
    paragraphs: { type: 'array', items: { type: 'string' } },
    bullets: { type: 'array', items: { type: 'string' } },
    table: { type: 'object', additionalProperties: false, required: ['headers', 'rows'], properties: { headers: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } },
  },
} as const;
const sectionParse = z.object({ heading: z.string(), paragraphs: z.array(z.string()), bullets: z.array(z.string()), table: z.object({ headers: z.array(z.string()), rows: z.array(z.array(z.string())) }) });
export type DraftedSection = z.infer<typeof sectionParse>;

/**
 * A new section for an existing page (what the plan task asks for: a comparison table, a "why us",
 * a process, a service overview), from facts on the site only.
 */
export async function draftSection(ai: OpenAiClient, p: { task: string; kind: 'section' | 'comparison_table'; url: string; name: string; mainKeyword: string | null; text: string; problems: string[] }, profile: BusinessProfile): Promise<{ section: DraftedSection; tokens: number }> {
  const r = await ai.generateJson({
    name: 'page_section',
    system:
      `You write one new section for a page of ${profile.name}, for what this task asks: "${p.task}". Use ONLY facts in the page text or the profile; never invent numbers, prices, years, certifications, clients, reviews or results. ` +
      'Plain English, no guarantees, medical or legal claims, no competitor names. A short H2 "heading" (3–8 words), 1–3 "paragraphs" (60–200 words in total), up to 6 "bullets" (or []). ' +
      (p.kind === 'comparison_table'
        ? 'Also a comparison "table" with 2–5 columns and 3–8 rows built only from the page text (e.g. services compared by what they cover); headers are the first row.'
        : 'Return "table" as { "headers": [], "rows": [] }.') +
      (p.problems.length ? ` Fix these problems of your earlier draft: ${p.problems.join('; ')}.` : '') +
      (profile.bannedWords.length ? ` Never use: ${profile.bannedWords.join(', ')}.` : ''),
    user: JSON.stringify({ page: p.name, url: p.url, main_keyword: p.mainKeyword, services: profile.services, places: profile.places, page_text: p.text.slice(0, 5000) }),
    jsonSchema: sectionSchema as unknown as Record<string, unknown>,
    parse: sectionParse,
    maxOutputTokens: 1600,
    timeoutMs: 90_000,
  });
  return { section: r.data, tokens: r.tokens };
}

const pageSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['h1', 'metaTitle', 'metaDescription', 'intro', 'sections', 'faq'],
  properties: {
    h1: { type: 'string' },
    metaTitle: { type: 'string' },
    metaDescription: { type: 'string' },
    intro: { type: 'string' },
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['heading', 'paragraphs', 'bullets'], properties: { heading: { type: 'string' }, paragraphs: { type: 'array', items: { type: 'string' } }, bullets: { type: 'array', items: { type: 'string' } } } } },
    faq: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } },
  },
} as const;
const pageParse = z.object({
  h1: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  intro: z.string(),
  sections: z.array(z.object({ heading: z.string(), paragraphs: z.array(z.string()), bullets: z.array(z.string()) })),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
});
export type DraftedPage = z.infer<typeof pageParse>;

/** A whole new page from the page plan (its main and supporting keywords and questions), from site facts only. */
export async function draftPage(ai: OpenAiClient, p: { task: string; mainKeyword: string; secondary: string[]; questions: string[]; pageType: string; siteText: string; suffix: string | null; problems: string[] }, profile: BusinessProfile): Promise<{ page: DraftedPage; tokens: number }> {
  const r = await ai.generateJson({
    name: 'new_page',
    system:
      `You write a new ${p.pageType || 'service'} page for ${profile.name}, for this plan task: "${p.task}". Main keyword: "${p.mainKeyword}". ` +
      'Use ONLY facts in the site text or the profile; never invent numbers, prices, years, certifications, clients, reviews or results. Plain English, no guarantees, medical or legal claims, no competitor names. ' +
      `"h1": the page's main heading with the main keyword (15–70 characters). "metaTitle": 50–60 characters${p.suffix ? ` including the site suffix "${p.suffix}"` : ''}, main keyword near the start. ` +
      '"metaDescription": 140–155 characters, complete sentences, a benefit and a call to action. "intro": 40–60 words that answer what the page offers, for whom and where. ' +
      '"sections": 3–5 sections, each a short H2 heading using a supporting keyword where natural, 1–2 paragraphs and optional bullets; 350–700 words in total. "faq": 3–5 questions people ask (use the given questions first), each answered in 1–3 sentences.' +
      (p.problems.length ? ` Fix these problems of your earlier draft: ${p.problems.join('; ')}.` : '') +
      (profile.bannedWords.length ? ` Never use: ${profile.bannedWords.join(', ')}.` : ''),
    user: JSON.stringify({ main_keyword: p.mainKeyword, supporting: p.secondary.slice(0, 8), questions: p.questions.slice(0, 6), services: profile.services, places: profile.places, site_text: p.siteText.slice(0, 6000) }),
    jsonSchema: pageSchema as unknown as Record<string, unknown>,
    parse: pageParse,
    maxOutputTokens: 4000,
    timeoutMs: 150_000,
  });
  return { page: r.data, tokens: r.tokens };
}
