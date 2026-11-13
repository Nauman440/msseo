import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiInput, buildReport, reportToMarkdown, sampleReport, type AuditData } from '../src';
import { generateAiRecommendations } from '../src/audit/ai-recommendations';
import { createOpenAiClient } from '../src/providers/openai';

const data: AuditData = {
  url: 'https://example.com/',
  pageLimit: 10,
  jsRendering: false,
  crawledAt: '2026-11-13T00:00:00Z',
  preflight: {
    origin: 'https://example.com',
    homepage: { url: 'https://example.com/', status: 200, finalUrl: 'https://example.com/', headers: {}, robotsDirectives: ['noindex'] },
    variants: [{ url: 'https://example.com/', status: 200 }],
    robots: { found: true, status: 200, body: 'User-agent: *\nDisallow:', sitemaps: [], disallowAll: [] },
    sitemaps: [],
    sitemapUrlChecks: [],
    sitemapUrlTotal: 0,
    botAccess: [{ ua: 'googlebot', status: 200 }],
  },
  summary: null,
  pages: [
    { resource_type: 'html', url: 'https://example.com/', status_code: 200, click_depth: 0, checks: {}, meta: { htags: { h1: [] }, content: { plain_text_word_count: 50 } } },
    { resource_type: 'html', url: 'https://example.com/a|b/', status_code: 404, click_depth: 1, checks: {}, meta: {} },
  ],
  psi: null,
};

const report = buildReport(data, { auditId: 'x', audience: 'expert', brand: 'Morosoft Technologies' });

describe('markdown export', () => {
  it('lists every issue with id, fix and all URLs in expert mode', () => {
    const md = reportToMarkdown(report, 'expert');
    expect(report.issues?.length).toBeGreaterThan(0);
    expect(md).toContain('# SEO audit: example.com');
    expect(md).toContain('1.3.2 · Critical');
    expect(md).toContain('**How to fix:**');
    expect(md).toMatch(/^### 1\. \[ \] /m);
    expect(md).toContain('https://example.com/a|b/');
    expect(md).toContain('## Suggested robots.txt');
  });

  it('hides checklist ids in client mode', () => {
    const md = reportToMarkdown(report, 'client');
    expect(md).not.toContain('1.3.2 ·');
    expect(md).not.toContain('Priority (ICE)');
  });

  it('still renders older reports that have no issues list', () => {
    const md = reportToMarkdown({ ...sampleReport, issues: undefined }, 'expert');
    expect(md).toContain('## Issues to fix');
  });
});

describe('AI recommendations', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends findings (not page HTML) and keeps only known rule ids', async () => {
    const reply = {
      summary_client: 'Your homepage is hidden from Google.',
      summary_expert: 'Homepage carries noindex.',
      recommendations: [{ title: 'Remove noindex', why: 'Blocks indexing', steps: ['Edit the SEO plugin setting'], rule_ids: ['1.3.2', '9.9.9'], impact: 'high', effort: 'low' }],
    };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(reply) }] }], usage: { input_tokens: 900, output_tokens: 100 } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { ai, tokens } = await generateAiRecommendations(report, createOpenAiClient({ apiKey: 'test', model: 'test-model' }));
    expect(tokens).toBe(1000);
    expect(ai.model).toBe('test-model');
    expect(ai.items[0]?.ruleIds).toEqual(['1.3.2']);

    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(JSON.stringify(aiInput(report))).toContain('1.3.2');
  });

  it('throws on a refusal so the audit can mark the step failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }), { status: 200 })));
    await expect(generateAiRecommendations(report, createOpenAiClient({ apiKey: 't' }))).rejects.toThrow(/declined/);
  });
});
