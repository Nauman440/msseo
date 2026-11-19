import { z } from 'zod';
import { createDfsBase } from './dataforseo-base';
import type { DfsConfig, Locale } from './dataforseo-competitors';

/**
 * AI assistants for Module 10 (docs.dataforseo.com, checked 2026-11-19):
 *  - ai_optimization/perplexity/llm_responses/live: `user_prompt` (≤ 500 chars), `model_name` "sonar",
 *    `max_output_tokens`, `web_search_country_iso_code` (sonar models); answer in items[type=message]
 *    .sections[].text with `annotations` (title, url); sample cost ≈ $0.007
 *  - ChatGPT uses the Module 6 client (chat_gpt/llm_responses/live, web_search, ≈ $0.03)
 *  - serp/google/organic/live/advanced with `load_async_ai_overview: true` (+$0.002, refunded when
 *    there is no AI Overview): item type "ai_overview" with items[] (ai_overview_element: title, text,
 *    markdown, references) and references[] (ai_overview_reference: source, domain, url, title)
 */
export const PERPLEXITY_MODEL = 'sonar';

const ref = z.object({ domain: z.string().nullable().optional(), url: z.string().nullable().optional(), title: z.string().nullable().optional() }).passthrough();
const element = z.object({ text: z.string().nullable().optional(), markdown: z.string().nullable().optional(), references: z.array(ref).nullable().optional() }).passthrough();
const serpItem = z.object({ type: z.string(), markdown: z.string().nullable().optional(), text: z.string().nullable().optional(), items: z.array(element).nullable().optional(), references: z.array(ref).nullable().optional() }).passthrough();
const section = z.object({ text: z.string().nullable().optional(), annotations: z.array(ref).nullable().optional() }).passthrough();
const message = z.object({ type: z.string(), sections: z.array(section).nullable().optional() }).passthrough();

export type AiAnswer = { text: string; citations: { url: string; title: string | null }[] };

const dedupe = (xs: { url: string; title: string | null }[]) => {
  const seen = new Set<string>();
  return xs.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true))).slice(0, 20);
};

export function createAiClient(cfg: DfsConfig) {
  const dfs = createDfsBase(cfg, 'AI Optimization');
  const serp = createDfsBase(cfg, 'SERP');
  return {
    async perplexity(prompt: string, countryIso: string | undefined): Promise<{ answer: AiAnswer; cost: number }> {
      const { items, cost } = await dfs.live(
        '/v3/ai_optimization/perplexity/llm_responses/live',
        { user_prompt: prompt.slice(0, 500), model_name: PERPLEXITY_MODEL, max_output_tokens: 1024, ...(countryIso ? { web_search_country_iso_code: countryIso } : {}) },
        120_000,
      );
      const sections = items.flatMap((i) => {
        const m = message.safeParse(i);
        return m.success && m.data.type === 'message' ? m.data.sections ?? [] : [];
      });
      return {
        cost,
        answer: {
          text: sections.map((s) => s.text ?? '').join('\n').trim().slice(0, 6000),
          citations: dedupe(sections.flatMap((s) => s.annotations ?? []).flatMap((a) => (a.url ? [{ url: a.url, title: a.title ?? null }] : []))),
        },
      };
    },
    /** Google's AI Overview for a search (Google's own links to Maps or Search are not sources) (null when Google shows none). */
    async aiOverview(keyword: string, l: Locale): Promise<{ answer: AiAnswer | null; cost: number }> {
      const { items, cost } = await serp.live('/v3/serp/google/organic/live/advanced', { keyword, location_name: l.country, language_code: l.language, depth: 10, load_async_ai_overview: true });
      const o = items.map((i) => serpItem.safeParse(i)).find((p) => p.success && p.data.type === 'ai_overview');
      if (!o || !o.success) return { answer: null, cost };
      const d = o.data;
      const text = [d.markdown ?? d.text ?? '', ...(d.items ?? []).map((e) => e.markdown ?? e.text ?? '')].join('\n').trim().slice(0, 6000);
      const refs = [...(d.references ?? []), ...(d.items ?? []).flatMap((e) => e.references ?? [])];
      return { cost, answer: { text, citations: dedupe(refs.flatMap((r) => (r.url && !GOOGLE_OWN.test(r.url) ? [{ url: r.url, title: r.title ?? r.domain ?? null }] : []))) } };
    },
  };
}
/** Google Maps / Search links inside an overview point back at Google, not at a source. */
const GOOGLE_OWN = /^https?:\/\/([a-z0-9-]+\.)*google\.[a-z.]+(\/|$)/i;
export type AiClient = ReturnType<typeof createAiClient>;
