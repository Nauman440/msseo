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
