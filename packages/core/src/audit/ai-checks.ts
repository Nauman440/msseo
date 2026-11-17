import { z } from 'zod';
import type { OpenAiClient } from '../providers/openai';
import { mainTerm } from './content-signals';
import type { PageContent } from './page-content';
import type { Template } from './templates';

/**
 * AI-judged checks (spec §5.3 step 10, Phase 4 / plan step 7). One structured verdict per
 * key page (template representatives) and one vision verdict on the PageSpeed mobile
 * screenshot of the homepage. Bounded by a page count and a token budget; results are
 * cached by a hash of exactly what is sent, so unchanged pages cost nothing next time.
 * Never fails the audit: anything that goes wrong is recorded and its rules are skipped.
 */
export const PAGE_CHECKS = ['titleEarnsClick', 'titleMatchesContent', 'descriptionBenefitCta', 'headingsCoverSubtopics', 'intentMatchesPageType', 'relatedTerms', 'entities', 'answerQuality'] as const;
export type PageCheck = (typeof PAGE_CHECKS)[number];
export const VISUAL_CHECKS = ['intrusivePopup', 'ctaAboveFold', 'stockPhotos'] as const;
export type VisualCheck = (typeof VISUAL_CHECKS)[number];

export type Verdict = { verdict: 'pass' | 'warn' | 'fail'; note: string };
export type AiPageFinding = { url: string; type: string; checks: Record<PageCheck, Verdict> };
export type AiFindings = {
  model: string;
  pages: AiPageFinding[];
  visual: (Record<VisualCheck, Verdict> & { url: string }) | null;
  tokens: number;
  cached: number;
  errors: string[];
};

export type AiCache = { get: (key: string) => Promise<unknown | undefined>; set: (key: string, value: unknown) => Promise<void> };

const verdictJson = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'note'],
  properties: { verdict: { type: 'string', enum: ['pass', 'warn', 'fail'] }, note: { type: 'string' } },
};
const verdictZod = z.object({ verdict: z.enum(['pass', 'warn', 'fail']), note: z.string().max(400) });
const objectOf = <K extends string>(keys: readonly K[]) => ({
  type: 'object',
  additionalProperties: false,
  required: [...keys],
  properties: Object.fromEntries(keys.map((k) => [k, verdictJson])),
});
const pageZod = z.object(Object.fromEntries(PAGE_CHECKS.map((k) => [k, verdictZod])) as Record<PageCheck, typeof verdictZod>);
const visualZod = z.object(Object.fromEntries(VISUAL_CHECKS.map((k) => [k, verdictZod])) as Record<VisualCheck, typeof verdictZod>);

const PAGE_SYSTEM = `You are a senior SEO reviewer for local service businesses. Judge one web page from its title, meta description, headings and main text.
For each check answer pass, warn or fail, with a short note (max 25 words) in plain English a business owner understands. Say what is missing or how to improve; do not repeat the check name.
- titleEarnsClick: does the title give a reason to click (benefit, offer, proof, location) rather than just a label?
- titleMatchesContent: does the title match what the page actually covers and the likely search intent?
- descriptionBenefitCta: does the meta description state a benefit and a call to action? Missing description = fail.
- headingsCoverSubtopics: do the H2/H3 headings cover the subtopics a visitor expects for this page type?
- intentMatchesPageType: does the content serve the intent of this page type (e.g. a service page sells the service; a blog post informs)?
- relatedTerms: does the text use the related and secondary terms people search for around the main topic?
- entities: does it name concrete entities (brands, equipment, certifications, places served) that build relevance and trust?
- answerQuality: does the opening paragraph directly and usefully answer what the visitor came for?
Be fair: warn for "could be better", fail only for clear problems.`;

const VISUAL_SYSTEM = `You review a mobile screenshot of a website's homepage (the first screen a phone visitor sees).
Answer pass, warn or fail with a short plain-English note (max 25 words):
- intrusivePopup: is the main content covered by a popup, cookie wall, chat window or interstitial? (covered = fail)
- ctaAboveFold: is a clear call to action (call button, phone number, quote/book button) visible without scrolling?
- stockPhotos: do the visible photos look like generic stock images rather than the real business, team or work? (no photos = pass)`;

const words = (s: string, n: number) => s.split(/\s+/).slice(0, n).join(' ');

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Key pages to judge: template representatives, most valuable types first (no legal/contact/archives). */
export function pagesToJudge(templates: Template[], content: PageContent[], max: number): { page: PageContent; type: string }[] {
  const skip = new Set(['legal', 'contact', 'category', 'blog_index', 'about']);
  const byUrl = new Map(content.map((c) => [c.url, c]));
  return templates
    .filter((t) => !skip.has(t.type))
    .map((t) => ({ page: byUrl.get(t.representative), type: t.label }))
    .filter((p): p is { page: PageContent; type: string } => Boolean(p.page && p.page.words >= 50))
    .slice(0, max);
}

export function pagePrompt(c: PageContent, type: string): string {
  return [
    `URL: ${c.url}`,
    `Page type: ${type}`,
    `Main topic (from URL/H1): ${mainTerm(c).join(' ') || 'unknown'}`,
    `Title: ${c.title ?? '(missing)'}`,
    `Meta description: ${c.description ?? '(missing)'}`,
    `H1: ${c.h1.join(' | ') || '(missing)'}`,
    `Headings:\n${c.headings.slice(0, 30).map((h) => `${'  '.repeat(Math.max(0, h.level - 1))}H${h.level} ${h.text}`).join('\n') || '(none)'}`,
    `Opening paragraph: ${c.firstParagraph ?? '(none)'}`,
    `Main text (first 900 words):\n${words(c.text, 900)}`,
  ].join('\n');
}

export async function runAiChecks(o: {
  client: OpenAiClient;
  pages: { page: PageContent; type: string }[];
  /** The homepage mobile screenshot, when PageSpeed provides one (awaited only by the vision check). */
  screenshot?: Promise<{ url: string; image: string } | undefined>;
  maxTokens: number;
  cache?: AiCache;
  /** Resolves when the budget is up; unfinished checks are dropped. */
  deadline?: Promise<void>;
}): Promise<AiFindings> {
  const findings: AiFindings = { model: o.client.model, pages: [], visual: null, tokens: 0, cached: 0, errors: [] };
  let stopped = false;
  void o.deadline?.then(() => (stopped = true));

  const cached = async <T,>(key: string, run: () => Promise<{ data: T; tokens: number }>): Promise<T | null> => {
    const hit = (await o.cache?.get(key).catch(() => undefined)) as T | undefined;
    if (hit) {
      findings.cached++;
      return hit;
    }
    if (stopped || findings.tokens >= o.maxTokens) return null;
    const { data, tokens } = await run();
    findings.tokens += tokens;
    await o.cache?.set(key, data).catch(() => undefined);
    return data;
  };

  const queue = [...o.pages];
  const pageWork = Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (let item = queue.shift(); item && !stopped; item = queue.shift()) {
      const prompt = pagePrompt(item.page, item.type);
      try {
        const key = `page:${o.client.model}:${await sha256(PAGE_SYSTEM + prompt)}`;
        const checks = await cached(key, () =>
          o.client.generateJson({ system: PAGE_SYSTEM, user: prompt, name: 'page_checks', jsonSchema: objectOf(PAGE_CHECKS), parse: pageZod, maxOutputTokens: 900, timeoutMs: 60_000 }),
        );
        if (checks) findings.pages.push({ url: item.page.url, type: item.type, checks });
      } catch (err) {
        findings.errors.push(`${item.page.url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });

  const visualWork = (async () => {
    const shot = await o.screenshot?.catch(() => undefined);
    if (!shot || stopped) return;
    try {
      const key = `visual:${o.client.model}:${await sha256(VISUAL_SYSTEM + shot.image)}`;
      const visual = await cached(key, () =>
        o.client.generateJson({ system: VISUAL_SYSTEM, user: `Homepage: ${shot.url}`, images: [shot.image], name: 'visual_checks', jsonSchema: objectOf(VISUAL_CHECKS), parse: visualZod, maxOutputTokens: 500, timeoutMs: 60_000 }),
      );
      if (visual) findings.visual = { ...visual, url: shot.url };
    } catch (err) {
      findings.errors.push(`screenshot: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();

  await Promise.race([Promise.all([...pageWork, visualWork]), o.deadline ?? new Promise(() => undefined)]);
  stopped = true;
  // Keep a stable order (the order pages were chosen in).
  const order = new Map(o.pages.map((p, i) => [p.page.url, i]));
  findings.pages.sort((a, b) => (order.get(a.url) ?? 0) - (order.get(b.url) ?? 0));
  return { ...findings, pages: [...findings.pages], errors: [...findings.errors] };
}
