import { describe, expect, it } from 'vitest';
import {
  executionPlan, mapPlanTasks, orderTasks, runWorkItems, taskExec, taskFinished, taskProgress, waitingFor,
  type ActionItem, type ActionWorkspace, type WorkItem, type WpApplyResult, type WpChange,
} from '../src';

let n = 0;
const task = (title: string, o: { month?: number; week?: number; severity?: ActionItem['severity']; doer?: string; item?: string; dependsOn?: string[]; taskId?: string; status?: ActionItem['status']; urls?: string[]; change?: string } = {}): ActionItem => ({
  id: `a${++n}`, source: { kind: 'ai', planId: 'p', taskId: o.taskId ?? `${o.month ?? 1}.${String(n).padStart(2, '0')}` }, title, detail: '', severity: o.severity ?? 'medium', impact: 3, confidence: 3, effort: 2, priority: 4,
  urls: o.urls ?? [], owner: null, dueDate: null, approval: 'none', approvedAt: null, approvedBy: null, status: o.status ?? 'todo', bucket: 'd30', bucketLocked: false, before: null, doneAt: null, checkpoints: [], createdAt: '', updatedAt: '',
  plan: { taskId: o.taskId ?? `${o.month ?? 1}.${String(n).padStart(2, '0')}`, month: o.month ?? 1, week: o.week ?? 1, doer: (o.doer ?? 'automatic') as never, category: 'on_page', why: '', change: o.change ?? '', keywords: [], dependsOn: o.dependsOn ?? [], successCheck: '', checkAfterDays: 14, ...(o.item ? { siteWideItem: o.item as never } : {}) },
} as ActionItem);
const item = (actionId: string, id: string, o: Partial<WorkItem> = {}): WorkItem => ({
  id, accountId: 'a', domain: 'site.test', actionId, taskId: null, type: 'meta_title', target: { post_id: 1 }, url: 'https://site.test/', label: id, before: 'Old', newValue: `New ${id}`, status: 'draft', reason: null,
  priority: 30, month: 1, week: 1, dependsOn: [], createdAt: '', scheduledFor: null, appliedAt: null, verifiedAt: null, attempts: 0, ...o,
});

describe('task → action type', () => {
  it('reads the type from the site-wide item, else from the task words', () => {
    expect(taskExec(task('New titles for 54 product pages', { item: 'meta_title' })).actionType).toBe('meta_title');
    expect(taskExec(task('One main heading on 5 pages', { item: 'h1' })).actionType).toBe('heading_fix');
    expect(taskExec(task('Image alt text on the homepage', { item: 'alt_text' })).actionType).toBe('image_alt');
    expect(taskExec(task('Fix meta descriptions on the service pages')).actionType).toBe('meta_description');
    expect(taskExec(task('Redirect the old /maritime-security/ page to Services'))).toMatchObject({ actionType: 'redirect_301' });
    expect(taskExec(task('Add a direct answer at the top of the homepage'))).toMatchObject({ actionType: 'content_block', block: 'direct_answer' });
    expect(taskExec(task('Add an FAQ with 5 customer questions to Services'))).toMatchObject({ actionType: 'content_block', block: 'faq' });
    expect(taskExec(task('Add a comparison table of voyage risk services'))).toMatchObject({ actionType: 'content_block', block: 'comparison_table' });
    expect(taskExec(task('Add Organization schema with sameAs')).actionType).toBe('schema');
    expect(taskExec(task('Create llms.txt for AI assistants')).actionType).toBe('llms_txt');
    expect(taskExec(task('Submit the verified WordPress sitemap'))).toMatchObject({ actionType: 'tool', tool: 'sitemap_submit' });
    expect(taskExec(task('Establish the 20-question AI visibility baseline'))).toMatchObject({ actionType: 'tool', tool: 'ai_check' });
  });
  it('makes people work manual: outreach, reviews, articles, client confirmations', () => {
    expect(taskExec(task('Outreach to 5 maritime directories', { doer: 'team' }))).toMatchObject({ actionType: 'manual', manualFor: 'team' });
    expect(taskExec(task('Ask 10 clients for Google reviews', { doer: 'team' })).actionType).toBe('manual');
    expect(taskExec(task('Confirm the services list', { doer: 'client' }))).toMatchObject({ actionType: 'manual', manualFor: 'client' });
    expect(taskExec(task('Write a new article on Red Sea transit risk', { doer: 'team' })).actionType).toBe('manual');
    expect(taskExec(task('Verify font loading and tracking-related delays', { doer: 'developer' }))).toMatchObject({ actionType: 'manual', manualFor: 'developer' });
  });
  it('backfills older plans with their type and target pages', () => {
    const ws: ActionWorkspace = { domain: 'site.test', updatedAt: null, actions: [task('New titles for every page', { item: 'meta_title' }), task('Title tags on About and Contact', { urls: ['https://site.test/about/', 'https://site.test/contact/'] })] };
    const r = mapPlanTasks(ws, ['https://site.test/', 'https://site.test/about/']);
    expect(r.changed).toBe(2);
    expect(r.ws.actions[0]!.exec).toMatchObject({ actionType: 'meta_title', targets: ['https://site.test/', 'https://site.test/about/'] });
    expect(r.ws.actions[1]!.exec!.targets).toEqual(['https://site.test/about/', 'https://site.test/contact/']);
    expect(mapPlanTasks(r.ws, ['https://site.test/', 'https://site.test/about/']).changed).toBe(0);
  });
});

describe('order and dependencies', () => {
  it('orders by month, week, severity, then plan order; skips finished and future months', () => {
    const a = task('Low week 1', { severity: 'low', week: 1, taskId: '1.01' });
    const b = task('Critical week 1', { severity: 'critical', week: 1, taskId: '1.05' });
    const c = task('High week 2', { severity: 'high', week: 2, taskId: '1.02' });
    const d = task('Critical week 1 later in plan', { severity: 'critical', week: 1, taskId: '1.09' });
    const done = task('Already done', { status: 'done' });
    const future = task('Month 2', { month: 2 });
    expect(orderTasks([a, b, c, d, done, future], 1).map((x) => x.title)).toEqual(['Critical week 1', 'Critical week 1 later in plan', 'Low week 1', 'High week 2']);
    expect(orderTasks([a, future], 2).map((x) => x.title)).toEqual(['Low week 1', 'Month 2']);
  });
  it('a task waits while a task it depends on is not done', () => {
    const first = task('Canonicals', { taskId: '1.01' });
    const second = task('Titles', { taskId: '1.02', dependsOn: ['1.01'] });
    expect(waitingFor(second, [first, second])).toEqual(['1.01']);
    const plan = executionPlan([first, second], [item(first.id, 'c1'), item(second.id, 't1')], { month: 1 });
    expect(plan.order).toEqual(['c1']);
    expect(plan.tasks.map((t) => t.step)).toEqual(['apply', 'waiting']);
    expect(waitingFor(second, [{ ...first, status: 'done' }, second])).toEqual([]);
  });
  it('manual tasks and tasks that need a person never block the queue', () => {
    const outreach = task('Outreach to 5 directories', { doer: 'team', week: 1, severity: 'critical' });
    const human = task('Direct answer on the Bricks homepage', { week: 1, severity: 'critical' });
    const titles = task('New titles', { week: 2 });
    const outreachM = { ...outreach, exec: { actionType: 'manual' as const, manualFor: 'team' as const, targets: [], mappedAt: '' } };
    const items = [item(outreach.id, 'm1', { type: 'manual', status: 'team' }), item(human.id, 'h1', { type: 'content_block', status: 'needs_human' }), item(titles.id, 't1'), item(titles.id, 't2')];
    const plan = executionPlan([outreachM, human, titles], items, { month: 1 });
    expect(plan.tasks.map((t) => `${t.title}:${t.step}`)).toEqual(['Outreach to 5 directories:manual', 'Direct answer on the Bricks homepage:needs_you', 'New titles:apply']);
    expect(plan.order).toEqual(['t1', 't2']);
    expect(taskProgress(outreachM, items).label).toBe('Manual (our team)');
    expect(taskProgress(human, items).state).toBe('needs_you');
  });
  it('"Run next task now" takes only the first task that has changes to send', () => {
    const t1 = task('Titles', { week: 1 });
    const t2 = task('Descriptions', { week: 2 });
    const items = [item(t1.id, 'a'), item(t1.id, 'b'), item(t2.id, 'c'), item('autopilot', 'site', { type: 'sitemap' })];
    expect(executionPlan([t1, t2], items, { month: 1, onlyNext: true }).order).toEqual(['a', 'b']);
    expect(executionPlan([t1, t2], items, { month: 1 }).order).toEqual(['site', 'a', 'b', 'c']);
  });
});

describe('completion and status', () => {
  it('a task is done only when every change is verified (or already right)', () => {
    const t = task('Titles');
    expect(taskFinished(t, [item(t.id, 'a', { status: 'verified' }), item(t.id, 'b', { status: 'applied' })])).toBe(false);
    expect(taskFinished(t, [item(t.id, 'a', { status: 'verified' }), item(t.id, 'b', { status: 'keep' })])).toBe(true);
    expect(taskFinished(t, [item(t.id, 'a', { status: 'verified' }), item(t.id, 'h', { type: 'content_block', status: 'needs_human' })])).toBe(false);
    expect(taskFinished(t, [])).toBe(false);
    expect(taskProgress(t, [item(t.id, 'a', { status: 'verified' }), item(t.id, 'b', { status: 'applied' }), item(t.id, 'c')]).label).toBe('Applying (2 of 3)');
    expect(taskProgress(t, [item(t.id, 'a', { status: 'verified' }), item(t.id, 'b', { status: 'keep' })]).label).toBe('Done & verified');
    expect(taskProgress(t, [], { preparing: true }).label).toBe('Preparing changes');
    expect(taskProgress(t, [item(t.id, 'a', { status: 'keep' }), item(t.id, 'b')]).label).toBe('Queued');
  });
});

describe('running in task order', () => {
  const site = (failIds: string[] = []) => {
    const sent: string[] = [];
    return {
      sent,
      wp: {
        async apply(c: WpChange): Promise<WpApplyResult> {
          sent.push(c.change_id);
          return failIds.includes(c.change_id) ? { status: 'failed', reason: 'refused' } : { status: 'applied', change_id: c.change_id, before: 'Old', after: String(c.new_value) };
        },
        async rollback() {
          return { status: 'rolled_back' as const };
        },
      },
      fetchPage: async () => ({ status: 200, html: `<title>${'New a'}</title><title>x</title>${'word '.repeat(300)}`, location: null }),
    };
  };
  it('sends changes in the executor’s order and stops at the daily cap', async () => {
    const s = site();
    const items = [item('t2', 'c'), item('t1', 'a'), item('t1', 'b')];
    const r = await runWorkItems(items, { wp: s.wp, fetchPage: s.fetchPage, wait: async () => undefined }, { keyPages: ['https://site.test/'], firstRun: false, order: ['a', 'b', 'c'], cap: 2 });
    expect(s.sent).toEqual(['a', 'b']);
    expect(r.items.find((i) => i.id === 'c')!.status).toBe('draft');
  });
  it('tries a failing change twice, then skips it and carries on; three such failures pause the run', async () => {
    const s = site(['a', 'b', 'c']);
    const items = [item('t1', 'a'), item('t1', 'b'), item('t1', 'c'), item('t1', 'd')];
    const r = await runWorkItems(items, { wp: s.wp, fetchPage: s.fetchPage, wait: async () => undefined }, { keyPages: ['https://site.test/'], firstRun: false, order: ['a', 'b', 'c', 'd'] });
    expect(s.sent).toEqual(['a', 'a', 'b', 'b', 'c', 'c']);
    expect(r.items.find((i) => i.id === 'a')!.reason).toMatch(/^Failed twice/);
    expect(r.run.paused).toBe(true);
    expect(r.items.find((i) => i.id === 'd')!.status).toBe('draft');
  });
});

describe('sections and new pages are plugin work, not notes', () => {
  it('maps the wording', () => {
    expect(taskExec(task('Add a why choose us section to the homepage'))).toMatchObject({ actionType: 'content_block', block: 'section' });
    expect(taskExec(task('Add a testimonials section to the homepage'))).toMatchObject({ actionType: 'content_block', block: 'section' });
    expect(taskExec(task('Create a new page for voyage risk assessment')).actionType).toBe('create_page');
    expect(taskExec(task('Build location pages for Dubai and Fujairah')).actionType).toBe('create_page');
    expect(taskExec(task('Add trust badges to the About page')).actionType).not.toBe('create_page');
    expect(taskExec(task('Write a new article on Red Sea transit risk', { doer: 'team' })).actionType).toBe('manual');
  });
});
