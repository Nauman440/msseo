import { describe, expect, it, vi } from 'vitest';
import { assertSameSite, emptyActions, emptyKeywordWorkspace, PlanInputMismatchError, siteQuestions, writeAiPlan, type OpenAiClient, type ReportModel } from '../src';

const prompt = (text: string, custom = false) => ({ id: text.toLowerCase().replace(/\W+/g, '-'), text, service: null, location: null, ...(custom ? { custom: true } : {}) });
// maxbox.uk (pet shop) with questions an agency site's answers left in its workspace (bug report 2026-11-25).
const AGENCY = [
  'Who can help optimise my Google Business Profile for more calls?',
  'Which agencies offer affordable local SEO for small businesses?',
  'My business has disappeared from Google Maps, what should I do?',
];
const PETS = ['What is the best grain-free dry dog food in the UK?', 'Are natural dog treats better for puppies?'];
const maxbox = () => {
  const kw = emptyKeywordWorkspace('maxbox.uk', { businessType: 'shop', seeds: { services: ['dry dog food', 'dog treats'] } });
  return { ...kw, prompts: [...AGENCY, ...PETS].map((t) => prompt(t)) };
};

describe('a plan is only ever built from its own website’s data', () => {
  it('refuses inputs that belong to another website and logs the error', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => assertSameSite('maxbox.uk', [{ label: 'keyword research', domain: 'www.maxbox.uk' }, { label: 'AI search', domain: null }])).not.toThrow();
    expect(() => assertSameSite('maxbox.uk', [{ label: 'AI search', domain: 'agency-site.com' }])).toThrow(PlanInputMismatchError);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('agency-site.com'));
    log.mockRestore();
  });

  it('leaves out AI questions that are not about the website; hand-written questions always stay', () => {
    const kw = maxbox();
    const own = siteQuestions(kw);
    expect(own.questions).toEqual(PETS);
    expect(own.dropped).toEqual(AGENCY);
    const withCustom = { ...kw, prompts: [...kw.prompts, prompt('Do you deliver to Northern Ireland?', true)] };
    expect(siteQuestions(withCustom).questions).toContain('Do you deliver to Northern Ireland?');
  });

  it('site A’s data never reaches site B’s plan', async () => {
    const calls: { user: string; system: string }[] = [];
    const client = {
      async generateJson(req: { name: string; user: string; system: string }) {
        calls.push(req);
        return { data: { summary: 's', baseline_and_targets: [], months: [], later: [], needs_developer: [], page_meta: [], data_gaps: [] }, tokens: 1, model: 'fake' };
      },
    } as unknown as OpenAiClient;
    const report = { id: 'a1', project: { name: 'Maxbox', domain: 'maxbox.uk' }, overall: { score: 70 }, pagesCrawled: 0, issues: [], pages: [], robots: { found: true, rows: [], suggested: '' }, sitemap: { found: false, url: '', rows: [], segments: [] } } as unknown as ReportModel;
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Another site's keyword workspace (or audit, or AI search results) handed to this site's plan: refused before any AI call.
    const agencyKw = { ...emptyKeywordWorkspace('agency-site.com'), prompts: AGENCY.map((t) => prompt(t)) };
    await expect(writeAiPlan(client, emptyActions('maxbox.uk'), { domain: 'maxbox.uk', tier: 'growth', keywords: agencyKw, mapping: null, report, start: new Date('2026-12-01T00:00:00Z') }, { newId: () => 'x' }))
      .rejects.toThrow(PlanInputMismatchError);
    await expect(writeAiPlan(client, emptyActions('maxbox.uk'), { domain: 'maxbox.uk', tier: 'growth', keywords: maxbox(), mapping: null, report, start: new Date('2026-12-01T00:00:00Z'), sources: [{ label: 'AI search', domain: 'agency-site.com' }] }, { newId: () => 'x' }))
      .rejects.toThrow(/AI search belongs to agency-site\.com/);
    expect(calls).toHaveLength(0);
    log.mockRestore();

    // Agency questions left in maxbox's own workspace never reach the prompt; its own questions do.
    const aiSearch = { checked_at: '2026-11-20', your_share_of_voice: 0, competitors_named_instead: [], questions_where_you_are_not_named: [AGENCY[0]!, PETS[0]!], blocked_crawlers: [], missing_entity_signals: [], answer_ready_problems: [], wrong_facts: [], cited_sources: [], snippet_controls: [], missing_third_party: [],
      answers: [{ question: AGENCY[0]!, assistant: 'ChatGPT', mentioned: false, cited: [] }, { question: PETS[0]!, assistant: 'ChatGPT', mentioned: false, cited: [] }] };
    const { workspace } = await writeAiPlan(client, emptyActions('maxbox.uk'), { domain: 'maxbox.uk', tier: 'growth', keywords: maxbox(), mapping: null, report, start: new Date('2026-12-01T00:00:00Z'), extras: { aiSearch } }, { newId: () => 'x' });
    const sent = calls.map((c) => c.system + c.user).join('\n');
    for (const q of AGENCY) expect(sent).not.toContain(q);
    expect(sent).toContain(PETS[0]);
    for (const q of AGENCY) expect(JSON.stringify(workspace.actions)).not.toContain(q);
    expect(workspace.aiPlan!.notes.join(' ')).toMatch(/Left out 3 AI question\(s\) that are not about this website/);
  });
});
