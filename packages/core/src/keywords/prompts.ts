import { z } from 'zod';
import type { OpenAiClient } from '../providers/openai';
import { normTerm } from './clean';
import type { AiPrompt, KeywordSeeds } from './types';

/**
 * 4.7 Questions people ask AI assistants (ChatGPT, Gemini, Perplexity…) where the business
 * should be named, grouped by service and location; saved for tracking (Module 10).
 * Only the seeds (services, places, brands) are sent to OpenAI, never Search Console data.
 */
export const PROMPT_RANGE = [30, 50] as const;

const id = (text: string) => normTerm(text).replace(/[^a-z0-9]+/g, '-').slice(0, 80);

function dedupe(list: AiPrompt[]): AiPrompt[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    const key = normTerm(p.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TEMPLATES: ((s: string, l: string) => string)[] = [
  (s, l) => `Who is the best ${s} company in ${l}?`,
  (s, l) => `How much does ${s} cost in ${l}?`,
  (s, l) => `Can you recommend a reliable ${s} service near ${l}?`,
  (s, l) => `Which ${s} companies in ${l} have the best reviews?`,
  (s, l) => `Who offers same-day or emergency ${s} in ${l}?`,
  (s, l) => `What should I check before hiring a ${s} company in ${l}?`,
];

/** Prompts without AI: every service × place through a fixed set of question shapes. */
export function templatePrompts(seeds: KeywordSeeds): AiPrompt[] {
  const services = seeds.services.map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  const places = seeds.locations.map((l) => l.trim()).filter(Boolean).slice(0, 4);
  const where = places.length ? places : ['my area'];
  const out: AiPrompt[] = [];
  for (const t of TEMPLATES)
    for (const s of services)
      for (const l of where) out.push({ id: '', text: t(s, l), service: s, location: places.length ? l : null });
  return dedupe(out.map((p) => ({ ...p, id: id(p.text) }))).slice(0, PROMPT_RANGE[1]);
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['prompts'],
  properties: {
    prompts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'service', 'location'],
        properties: { text: { type: 'string' }, service: { type: ['string', 'null'] }, location: { type: ['string', 'null'] } },
      },
    },
  },
};
const parse = z.object({ prompts: z.array(z.object({ text: z.string(), service: z.string().nullable(), location: z.string().nullable() })) });

/** OpenAI writes natural prompts; falls back to the templates if it is not configured or fails. */
export async function generatePrompts(ai: OpenAiClient | null, seeds: KeywordSeeds, business: string): Promise<{ prompts: AiPrompt[]; tokens: number; usedAi: boolean; error?: string }> {
  const fallback = templatePrompts(seeds);
  if (!ai || !seeds.services.length) return { prompts: fallback, tokens: 0, usedAi: false };
  try {
    const { data, tokens } = await ai.generateJson({
      name: 'ai_prompts',
      system:
        'You write the questions real customers type into AI assistants (ChatGPT, Gemini, Perplexity, Copilot) when they look for a local service business. ' +
        `Write ${PROMPT_RANGE[0]}–${PROMPT_RANGE[1]} varied, natural prompts: recommendations, costs, comparisons, urgent problems, brands and equipment, trust and reviews. ` +
        'Each prompt must be one the business would want to be named in. Set service and location to the seed it is about (exactly as given) or null. No numbering, no quotes.',
      user: JSON.stringify({ website: business, services: seeds.services, locations: seeds.locations, brands: seeds.brands, other_topics: seeds.extra }),
      jsonSchema: schema,
      parse,
      maxOutputTokens: 4000,
      timeoutMs: 90_000,
    });
    const known = (v: string | null, list: string[]) => (v && list.some((x) => x.toLowerCase() === v.toLowerCase()) ? v.toLowerCase() : null);
    const prompts = dedupe(
      data.prompts
        .map((p) => ({ text: p.text.trim().slice(0, 200), service: known(p.service, seeds.services), location: known(p.location, seeds.locations) }))
        .filter((p) => p.text.length >= 10)
        .map((p) => ({ ...p, id: id(p.text) })),
    ).slice(0, PROMPT_RANGE[1]);
    if (prompts.length < PROMPT_RANGE[0] / 2) return { prompts: fallback, tokens, usedAi: false, error: 'AI returned too few prompts' };
    return { prompts, tokens, usedAi: true };
  } catch (err) {
    return { prompts: fallback, tokens: 0, usedAi: false, error: err instanceof Error ? err.message : String(err) };
  }
}
