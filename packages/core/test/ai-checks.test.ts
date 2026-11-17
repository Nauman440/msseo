import { describe, expect, it } from 'vitest';
import { evaluateRules, type AuditData } from '../src';
import { PAGE_CHECKS, VISUAL_CHECKS, pagesToJudge, runAiChecks, type AiCache, type AiFindings, type Verdict } from '../src/audit/ai-checks';
import { parityGap } from '../src/audit/mobile-parity';
import { parsePageContent } from '../src/audit/page-content';
import { buildTemplates } from '../src/audit/templates';
import type { OpenAiClient } from '../src/providers/openai';

const U = (p: string) => `https://example.com${p}`;
const text = (n: number) => Array.from({ length: n }, (_, i) => `word${i % 30}`).join(' ');
const page = (path: string) => parsePageContent(`<title>T ${path}</title><main><h1>H</h1><p>${text(200)}</p></main>`, U(path));

const all = <K extends string>(keys: readonly K[], v: Verdict) => Object.fromEntries(keys.map((k) => [k, v])) as Record<K, Verdict>;
const pass: Verdict = { verdict: 'pass', note: 'Fine.' };

/** Fake OpenAI client: records calls, answers pass (or the given verdicts), 1,000 tokens per call. */
function fakeClient(page = all(PAGE_CHECKS, pass), visual = all(VISUAL_CHECKS, pass), delayMs = 0) {
  const calls: { name: string; images: number }[] = [];
  const client = {
    model: 'test-model',
    async generateJson(req: { name: string; images?: string[] }) {
      calls.push({ name: req.name, images: req.images?.length ?? 0 });
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return { data: req.name === 'visual_checks' ? visual : page, model: 'test-model', tokens: 1000 };
    },
  } as unknown as OpenAiClient;
  return { client, calls };
}

const memoryCache = (): AiCache => {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v) };
};

describe('AI checks', () => {
  const content = [page('/'), page('/services/ac-repair/'), page('/areas/plano/'), page('/privacy-policy/'), page('/contact/')];
  const templates = buildTemplates(content.map((c) => ({ url: c.url, content: c })), new Map());

  it('judges key page types only, up to the limit', () => {
    expect(pagesToJudge(templates, content, 10).map((p) => p.type)).toEqual(['Homepage', 'Service pages', 'Location pages']);
    expect(pagesToJudge(templates, content, 2)).toHaveLength(2);
  });

  it('judges pages and the mobile screenshot, then serves repeats from the cache', async () => {
    const cache = memoryCache();
    const pages = pagesToJudge(templates, content, 5);
    const shot = Promise.resolve({ url: U('/'), image: 'data:image/jpeg;base64,AAAA' });
    const first = fakeClient();
    const a = await runAiChecks({ client: first.client, pages, screenshot: shot, maxTokens: 50_000, cache });
    expect(a.pages.map((p) => p.url)).toEqual(pages.map((p) => p.page.url));
    expect(a.visual?.url).toBe(U('/'));
    expect(first.calls.filter((c) => c.images === 1)).toHaveLength(1);
    expect(a.tokens).toBe(4000);

    const second = fakeClient();
    const b = await runAiChecks({ client: second.client, pages, screenshot: shot, maxTokens: 50_000, cache });
    expect(second.calls).toHaveLength(0);
    expect(b.cached).toBe(4);
    expect(b.tokens).toBe(0);
  });

  it('stops at the token budget and at the deadline', async () => {
    const pages = pagesToJudge(templates, content, 5);
    const budget = await runAiChecks({ client: fakeClient().client, pages, maxTokens: 1000 });
    expect(budget.pages.length).toBeLessThan(pages.length);

    const slow = fakeClient(undefined, undefined, 300);
    const late = await runAiChecks({ client: slow.client, pages, maxTokens: 50_000, deadline: new Promise((r) => setTimeout(r, 50)) });
    expect(late.pages).toHaveLength(0);
  });

  it('flags parity gaps only for real differences', () => {
    expect(parityGap({ url: 'x', desktopWords: 800, mobileWords: 500, desktopLinks: 40, mobileLinks: 40 })).toBe(true);
    expect(parityGap({ url: 'x', desktopWords: 800, mobileWords: 760, desktopLinks: 40, mobileLinks: 25 })).toBe(true);
    expect(parityGap({ url: 'x', desktopWords: 120, mobileWords: 90, desktopLinks: 5, mobileLinks: 3 })).toBe(false);
  });
});

describe('step 7 rules', () => {
  const preflight: AuditData['preflight'] = {
    origin: 'https://example.com', homepage: { url: U('/'), status: 200, finalUrl: U('/'), headers: {}, robotsDirectives: [] },
    variants: [], robots: { found: true, status: 200, body: '', sitemaps: [], disallowAll: [] }, sitemaps: [], sitemapUrlChecks: [], sitemapUrlTotal: 0, botAccess: [],
  };
  const run = (extra: Partial<AuditData>) =>
    Object.fromEntries(evaluateRules({ url: U('/'), pageLimit: 10, jsRendering: false, mode: 'quick', crawledAt: '', preflight, summary: null, pages: [], psi: null, ...extra }).map((r) => [r.def.id, r]));

  it('without AI: no AI page rules, screenshot checks become manual, 1.3.6 is always a manual item', () => {
    const r = run({});
    expect(r['2.1.6']).toBeUndefined();
    expect(r['1.9.5']?.result.status).toBe('manual');
    expect(r['2.7.5']?.result.status).toBe('manual');
    expect(r['1.3.6']?.result.status).toBe('manual');
  });

  it('turns AI verdicts into results, with the AI note as the explanation', () => {
    const titleWarn = { ...all(PAGE_CHECKS, pass), titleEarnsClick: { verdict: 'warn', note: 'Add a benefit like same-day service.' } as Verdict };
    const ai: AiFindings = {
      model: 'm', tokens: 10, cached: 0, errors: [],
      pages: [
        { url: U('/'), type: 'Homepage', checks: all(PAGE_CHECKS, pass) },
        { url: U('/services/ac-repair/'), type: 'Service pages', checks: titleWarn },
      ],
      visual: { ...all(VISUAL_CHECKS, pass), intrusivePopup: { verdict: 'fail', note: 'A chat window covers half the screen.' }, url: U('/') },
    };
    const r = run({ ai, parity: [{ url: U('/'), desktopWords: 900, mobileWords: 400, desktopLinks: 30, mobileLinks: 30 }] });
    expect(r['2.1.6']?.result).toMatchObject({ status: 'warn', affectedCount: 1, applicableCount: 2 });
    expect(r['2.1.6']?.sub?.client).toBe('Add a benefit like same-day service.');
    expect(r['2.1.6']?.def.method).toBe('ai');
    expect(r['2.1.7']?.result.status).toBe('pass');
    expect(r['1.9.5']?.result).toMatchObject({ status: 'fail', message: { client: 'A chat window covers half the screen.' } });
    expect(r['2.7.5']?.result.status).toBe('pass');
    expect(r['1.9.3']?.result).toMatchObject({ status: 'warn', affectedCount: 1 });
  });
});
