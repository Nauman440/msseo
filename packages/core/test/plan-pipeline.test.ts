import { describe, expect, it } from 'vitest';
import { emptyActions, emptyKeywordWorkspace, planFile, planZip, writeAiPlan, type OpenAiClient, type ReportModel } from '../src';

const page = (path: string, o: Record<string, unknown> = {}) => ({
  url: `https://petbox.co.uk${path}`, title: `Pet treats ${path} | PetBox`, h1: 'Pet treats', words: 400, pageType: 'other', schemaTypes: [], links: [],
  description: `Natural pet treats delivered across the UK. ${path}`, h1Count: 1, canonical: `https://petbox.co.uk${path}`, noindex: false, images: 2, imagesNoAlt: 1,
  openGraph: { title: true, description: true, image: false }, ...o,
});
const report = {
  id: 'audit-1', overall: { score: 71 }, issues: [], pages: [page('/', { pageType: 'home' }), page('/products/chews/', { schemaTypes: ['Product'] }), page('/about/', { pageType: 'about' })],
} as unknown as ReportModel;

/** A fake OpenAI that answers each stage of the staged prompt and records what it was asked. */
function fakeClient() {
  const calls: { name: string; system: string; user: string }[] = [];
  const answer = (name: string, user: string): unknown => {
    if (name === 'seo_analysis') {
      return {
        study: { business_type: 'ecommerce', sells: 'pet treats', buyers: 'dog owners', revenue_model: 'online sales', page_inventory: [{ type: 'product', count: 1 }], money_pages: ['https://petbox.co.uk/products/chews/'], top_impression_pages: [], platform: 'Shopify', platform_issues: ['title suffix'] },
        checklist: [{ area: 'A', item: 'robots.txt blocks', status: 'Pass', evidence: 'no blocks', severity: 'None' }, { area: 'C', item: 'duplicate titles', status: 'Fail', evidence: '3 pages', severity: 'High' }],
        issues: [
          { issue_id: 'A-01', area: 'A', issue: 'Sitemap lists redirected URLs', severity: 'Critical', affected_url_count: 4, example_urls: [], fix: 'Remove them.', impact: 5, confidence: 4, effort: 1, doer: 'developer' },
          { issue_id: 'C-01', area: 'C', issue: 'Titles share one suffix twice', severity: 'High', affected_url_count: 3, example_urls: [], fix: 'One brand mention.', impact: 4, confidence: 4, effort: 1, doer: 'automatic' },
          { issue_id: 'G-01', area: 'G', issue: 'Thin collection copy', severity: 'Medium', affected_url_count: 1, example_urls: [], fix: 'Add 150 words.', impact: 3, confidence: 3, effort: 2, doer: 'team' },
        ],
        offpage: [1, 2, 3, 4, 5, 6].flatMap((m) => [
          { month: m, title: `Review requests month ${m}`, method: 'Email recent buyers.', targets: [], monthly_number: '15 review requests' },
          { month: m, title: `Pet blog outreach month ${m}`, method: 'Pitch a guide.', targets: ['dogblog.example'], monthly_number: '10 pitches' },
        ]),
        keyword_map: [
          { url: 'https://petbox.co.uk/products/chews/', main_keyword: 'dog chews', supporting_keywords: [], volume: 900, position: 12 },
          { url: 'https://petbox.co.uk/', main_keyword: 'Dog Chews', supporting_keywords: [], volume: 900, position: null },
        ],
        removed_keywords: [{ keyword: 'cat litter', reason: 'not sold' }],
        data_gaps: ['Search Console not connected'],
      };
    }
    if (name === 'page_fixes' || name === 'page_fixes_retry') {
      const pages = (JSON.parse(user) as { pages: { url: string }[] }).pages;
      return {
        rows: pages.map((p, i) => ({
          url: p.url, main_keyword: 'dog chews',
          // The first answer for the homepage title is too long; the retry fixes it.
          new_title: name === 'page_fixes' && p.url.endsWith('.uk/') ? 'Natural dog chews and healthy pet treats delivered fast across the whole UK | PetBox' : `Natural dog chews and pet treats, page ${i + 1} | PetBox UK`.slice(0, 58),
          new_meta: 'keep', new_h1: 'keep', h1_fix: '', correct_canonical: p.url, canonical_action: 'keep', other_fixes: [`Add internal links on ${p.url}`], priority: 'High',
        })),
      };
    }
    if (name.startsWith('month_')) {
      const m = Number(name.slice(6));
      return {
        theme: `Theme ${m}`, goal: `Goal ${m}`,
        tasks: [
          { id: `${m}.01`, week: 1, title: m === 5 ? 'Clean the sitemap' : `Task ${m}`, area: 'A', category: 'technical', why: 'w', urls: [], keywords: [], change: 'c', doer: 'developer', impact: 4, confidence: 4, effort: 2, priority: 8, depends_on: [`${m}.02`], success_check: 's', check_after_days: 14, issue_ids: m === 5 ? ['A-01'] : [], recurring: false, site_wide_item: 'none', page_group: 'none' },
          { id: `${m}.02`, week: 2, title: `Content ${m}`, area: 'G', category: 'content', why: 'w', urls: [], keywords: [], change: 'c', doer: 'team', impact: 3, confidence: 3, effort: 2, priority: 4.5, depends_on: [], success_check: 's', check_after_days: 28, issue_ids: [], recurring: false, site_wide_item: 'none', page_group: 'none' },
        ],
        later: [],
      };
    }
    return { summary: 'Four sentences.', baseline_and_targets: [{ metric: 'Audit score', now: '71', month_3_target: '80', month_6_target: '88' }] };
  };
  const client = {
    async generateJson(req: { name: string; system: string; user: string }) {
      calls.push({ name: req.name, system: req.system, user: req.user });
      return { data: answer(req.name, req.user), tokens: 100, model: 'fake' };
    },
  } as unknown as OpenAiClient;
  return { client, calls };
}

describe('staged 6-month plan (strategist prompt)', () => {
  it('runs every stage, repairs the plan, validates it and builds the output files', async () => {
    const { client, calls } = fakeClient();
    const steps: string[] = [];
    let n = 0;
    const { workspace } = await writeAiPlan(
      client,
      emptyActions('petbox.co.uk'),
      { domain: 'petbox.co.uk', tier: 'growth', keywords: emptyKeywordWorkspace('petbox.co.uk', { businessType: 'shop', seeds: { services: ['dog chews'] } }), mapping: null, report, start: new Date('2026-12-01T00:00:00Z'), extras: { competitors: ['chewco.co.uk'] } },
      { newId: () => `id${++n}`, now: new Date('2026-12-01T00:00:00Z'), report, onProgress: (s) => void steps.push(s) },
    );
    // Stages: analysis, one fix batch + its retry, months 1–6 one at a time, overview.
    expect(calls.map((c) => c.name)).toEqual(['seo_analysis', 'page_fixes', 'page_fixes_retry', 'month_1', 'month_2', 'month_3', 'month_4', 'month_5', 'month_6', 'plan_overview']);
    // The inputs are filled in from the site's data.
    expect(calls[0]!.system).toContain('Website: petbox.co.uk');
    expect(calls[0]!.system).toContain('Plan start date: 2026-12-01');
    expect(calls[0]!.system).toContain('competitors: chewco.co.uk');
    expect(calls[3]!.system).toContain('Write MONTH 1 ONLY');
    expect(steps.at(-1)).toMatch(/step 4 of 4/);

    const plan = workspace.aiPlan!;
    // The too-long homepage title went back once and came back inside 50–60 characters.
    const home = plan.pageFixes!.find((r) => r.url === 'https://petbox.co.uk/')!;
    expect(home.new_title.length).toBeGreaterThanOrEqual(50);
    expect(home.new_title.length).toBeLessThanOrEqual(60);
    expect(plan.pageFixes).toHaveLength(3);

    const tasks = workspace.actions.filter((a) => a.plan);
    // The critical sitemap issue moved from month 5 into months 1–3; dependencies only point back.
    expect(tasks.find((a) => a.plan!.issueIds?.includes('A-01'))!.plan!.month).toBeLessThanOrEqual(3);
    expect(tasks.find((a) => a.plan!.issueIds?.includes('G-01'))).toBeTruthy();
    const order = new Map(tasks.map((a, i) => [a.plan!.taskId, i]));
    for (const a of tasks) for (const d of a.plan!.dependsOn) expect(order.get(d)!).toBeLessThan(order.get(a.plan!.taskId)!);
    // Two off-page tasks in every month, from the programme.
    for (let m = 1; m <= 6; m++) expect(tasks.filter((a) => a.plan!.month === m && a.plan!.category === 'off_page').length).toBeGreaterThanOrEqual(2);

    const v = Object.fromEntries(plan.validation!.map((l) => [l.check, l.pass]));
    expect(v['plan.json has months 1–6']).toBe(true);
    expect(v['Every issue_id appears in a task or in "later" with a reason']).toBe(true);
    expect(v['Every Critical and High issue is scheduled in Months 1–3']).toBe(true);
    expect(v['Every indexable URL in the crawl appears in page_fixes.csv']).toBe(true);
    expect(v['No keyword is the main keyword of two URLs']).toBe(true);
    expect(v['All depends_on ids are earlier tasks; all dates inside their month']).toBe(true);
    // Too few findings to fill 12 tasks a month: reported as FAIL, never padded.
    expect(plan.validation!.some((l) => !l.pass && /^Month \d/.test(l.check))).toBe(true);

    expect(planFile(workspace, 'plan.md')).toContain('# 6-month SEO plan: petbox.co.uk');
    expect(planFile(workspace, 'issue_register.csv')).toContain('A-01');
    expect(planFile(workspace, 'validation.txt')).toMatch(/PASS {2}plan.json has months 1–6/);
    expect(JSON.parse(planFile(workspace, 'plan.json')!).months).toHaveLength(6);
    expect(planZip(workspace)!.length).toBeGreaterThan(1000);
  });
});
