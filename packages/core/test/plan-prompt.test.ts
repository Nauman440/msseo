import { describe, expect, it } from 'vitest';
import { emptyActions, emptyKeywordWorkspace, OpenAiCutOffError, PLAN_FILES, PLAN_PROMPT_RULES, planFile, planZip, titleSuffix, writeAiPlan, type OpenAiClient, type ReportModel } from '../src';

const page = (path: string, o: Record<string, unknown> = {}) => ({
  url: `https://petbox.co.uk${path}`, title: `Natural pet treats ${path} | PetBox`, h1: 'Pet treats', words: 400, pageType: 'other', schemaTypes: [], links: [],
  description: `Natural pet treats delivered across the UK. ${path}`, h1Count: 1, canonical: `https://petbox.co.uk${path}`, noindex: false, images: 2, imagesNoAlt: 1,
  openGraph: { title: true, description: true, image: true }, ...o,
});
const report = {
  id: 'audit-1', overall: { score: 71 }, pagesCrawled: 4,
  robots: { found: true, rows: [], suggested: '' },
  sitemap: { found: true, url: 'https://petbox.co.uk/sitemap.xml', rows: [], segments: [{ label: 'valid', value: 3, tone: 'pass' }] },
  issues: [
    { ruleId: '1.5.1', category: 'technical', severity: 'high', status: 'fail', title: { client: 'Broken pages', expert: '4xx errors' }, message: { client: '', expert: '2 pages return 404' }, explain: { client: '', expert: '' }, fix: { client: '', expert: 'Redirect them to the closest live page.' }, affectedCount: 2, urls: ['https://petbox.co.uk/old/'], ice: { impact: 4, confidence: 4, effort: 1 } },
    { ruleId: '2.4.9', category: 'onpage', severity: 'medium', status: 'warn', title: { client: 'Thin pages', expert: 'Thin pages' }, message: { client: '', expert: '1 page under 300 words' }, explain: { client: '', expert: '' }, fix: { client: '', expert: 'Add useful copy.' }, affectedCount: 1, urls: ['https://petbox.co.uk/collections/chews/'], ice: { impact: 3, confidence: 3, effort: 2 } },
  ],
  pages: [
    page('/', { pageType: 'home', schemaTypes: ['Organization', 'WebSite'] }),
    page('/products/chews/', { schemaTypes: ['Product'] }),
    page('/collections/chews/', { pageType: 'category' }),
    page('/about/', { pageType: 'about' }),
  ],
} as unknown as ReportModel;

const task = (id: string, o: Record<string, unknown> = {}) => ({
  id, week: 2, title: `Task ${id}`, why: 'Because.', change: 'Change it.', urls: [], keywords: [], category: 'content', doer: 'team', site_wide_item: 'none', page_group: 'none',
  issue_ids: [], depends_on: [], success_check: 'Checked.', check_after_days: 14, impact: 3, confidence: 3, effort: 2, ...o,
});
const answer = {
  summary: 'Four sentences.',
  baseline_and_targets: [{ metric: 'Audit score', now: '71', month_3_target: '80', month_6_target: '88' }],
  months: [1, 2, 3, 4, 5, 6].map((m) => ({
    month: m, theme: `Theme ${m}`, goal: `Goal ${m}`,
    tasks: m === 1
      ? [
        task('1.01', { title: 'Meta titles for products', category: 'on_page', doer: 'approve', site_wide_item: 'meta_title', page_group: 'products' }),
        task('1.02', { title: 'Rebuild the theme header', category: 'technical', doer: 'team', depends_on: ['1.03'] }),
        task('1.03', { title: 'AI-visibility baseline', category: 'aeo' }),
      ]
      : m === 4
        ? [task('4.01', { title: 'Redirect the broken pages', category: 'technical', issue_ids: ['1.5.1'] })]
        : [task(`${m}.01`)],
  })),
  later: [],
  needs_developer: [{ issue_id: '', issue: 'Lazy-load the theme slider', reason: 'Only in theme code.' }],
  data_gaps: ['Search Console not connected'],
};

function fakeClient() {
  const calls: { name: string; system: string; user: string; maxOutputTokens?: number }[] = [];
  let cut = true;
  const client = {
    async generateJson(req: { name: string; system: string; user: string; maxOutputTokens?: number }) {
      calls.push({ name: req.name, system: req.system, user: req.user, maxOutputTokens: req.maxOutputTokens });
      if (cut) {
        cut = false;
        throw new OpenAiCutOffError('max_output_tokens');
      }
      return { data: structuredClone(answer), tokens: 500, model: 'fake' };
    },
  } as unknown as OpenAiClient;
  return { client, calls };
}

describe('6-month plan in one call (plan prompt)', () => {
  it('fills the prompt from the site, asks once (more room when cut off), repairs and checks the answer', async () => {
    const { client, calls } = fakeClient();
    const steps: string[] = [];
    let n = 0;
    const { workspace } = await writeAiPlan(
      client,
      emptyActions('petbox.co.uk'),
      {
        domain: 'petbox.co.uk', tier: 'growth', keywords: emptyKeywordWorkspace('petbox.co.uk', { businessType: 'shop', seeds: { services: ['dog chews'] } }), mapping: null, report,
        start: new Date('2026-12-01T00:00:00Z'), extras: { competitors: ['chewco.co.uk'] }, connected: 'shopify',
      },
      { newId: () => `id${++n}`, now: new Date('2026-12-01T00:00:00Z'), report, onProgress: (s) => void steps.push(s) },
    );
    // One prompt; the cut-off answer is asked again with double the output limit.
    expect(calls.map((c) => c.name)).toEqual(['six_month_plan', 'six_month_plan']);
    expect(calls.map((c) => c.maxOutputTokens)).toEqual([32_000, 64_000]);
    const { system, user } = calls[0]!;
    expect(system).toContain(PLAN_PROMPT_RULES);
    expect(system).toContain('Aim for 20 tasks a month');
    expect(user).toContain('Domain: petbox.co.uk | Platform: Shopify | Type: ecommerce');
    expect(user).toContain('CMS title suffix: " | PetBox"');
    expect(user).toContain('Start date: 2026-12-01 | Monthly capacity: 40 automatic changes, 4 new pages, 4 articles');
    expect(user).toContain('through the Shopify connection');
    expect(user).toMatch(/<audit_issues>[\s\S]*1\.5\.1 \| 2 pages return 404 \| High \| 2 \| https:\/\/petbox\.co\.uk\/old\//);
    expect(user).toMatch(/<site_check>[\s\S]*SC-\d\d \| Images without alt text \| Low \| 4/);
    expect(user).toContain('Pages without BreadcrumbList schema');
    expect(user).toContain('<ai_visibility>\nnot checked yet');
    expect(user).toContain('<offpage>\nBacklinks: not checked yet');
    expect(steps).toEqual(['Writing the 6-month plan', 'Checking the plan against the rules']);

    const plan = workspace.aiPlan!;
    const tasks = workspace.actions.filter((a) => a.plan);
    // The High 404 issue moved from month 4 into months 1–2 (and, as a blocker, month 1 weeks 1–2).
    const redirect = tasks.find((a) => a.plan!.issueIds?.includes('1.5.1'))!;
    expect(redirect.plan!.month).toBe(1);
    expect(redirect.plan!.week).toBeLessThanOrEqual(2);
    // Every issue is in a task; the developer-only item stays out of the plan.
    expect(tasks.find((a) => a.plan!.issueIds?.includes('2.4.9'))).toBeTruthy();
    expect(plan.needsDeveloper).toEqual([expect.objectContaining({ issue: 'Lazy-load the theme slider' })]);
    // Rule 4: Month 1 batches; schema is added from the crawl (no BreadcrumbList).
    for (const item of ['meta_title', 'schema', 'alt_text']) expect(tasks.some((a) => a.plan!.month === 1 && a.plan!.siteWideItem === item)).toBe(true);
    // Rule 5: an AI-visibility baseline or re-test and at least two AEO tasks in every month.
    for (let m = 1; m <= 6; m++) {
      const aeo = tasks.filter((a) => a.plan!.month === m && a.plan!.category === 'ai_visibility');
      expect(aeo.some((a) => /baseline|re-?test/i.test(a.title))).toBe(true);
      // This small site has AI-search findings for the first months only; later months are reported short.
      if (m <= 3) expect(aeo.length).toBeGreaterThanOrEqual(2);
    }
    // Rule 9: dependencies only on earlier tasks.
    const order = new Map(tasks.map((a, i) => [a.plan!.taskId, i]));
    for (const a of tasks) for (const d of a.plan!.dependsOn) expect(order.get(d)!).toBeLessThan(order.get(a.plan!.taskId)!);

    const v = Object.fromEntries(plan.validation!.map((l) => [l.check, l.pass]));
    expect(v['1. Exactly 6 months']).toBe(true);
    expect(v['2. Every issue_id and site_check problem is in a task (or needs a developer)']).toBe(true);
    expect(v['2. Critical and High issues are in Months 1–2']).toBe(true);
    expect(v['3. No developer tasks']).toBe(true);
    expect(v['9. Dependencies only on earlier tasks']).toBe(true);
    // Too few findings to fill 12 tasks a month: reported, never padded with filler.
    expect(plan.validation!.some((l) => !l.pass && /^Month \d/.test(l.check))).toBe(true);

    expect(PLAN_FILES).toContain('needs_developer.md');
    expect(planFile(workspace, 'plan.md')).toContain('# 6-month SEO plan: petbox.co.uk');
    expect(planFile(workspace, 'issue_register.csv')).toMatch(/1\.5\.1,.*,1\.\d\d/);
    expect(planFile(workspace, 'needs_developer.md')).toContain('Lazy-load the theme slider');
    expect(JSON.parse(planFile(workspace, 'plan.json')!).months).toHaveLength(6);
    expect(planZip(workspace)!.length).toBeGreaterThan(1000);
  });

  it('finds the title suffix the CMS adds', () => {
    expect(titleSuffix([{ title: 'Dog chews | PetBox' }, { title: 'Cat toys | PetBox' }, { title: 'About us | PetBox' }])).toBe(' | PetBox');
    expect(titleSuffix([{ title: 'Dog chews' }, { title: 'Cat toys – PetBox' }, { title: 'About' }])).toBeNull();
  });
});
