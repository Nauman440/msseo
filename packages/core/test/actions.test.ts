import { describe, expect, it } from 'vitest';
import {
  actionsToCsv, actionSummary, addActions, assignBuckets, emptyActions, fromMappingRow, hasDueChecks, judgeCheckpoint, needsApproval, openActions, priorityOf, runChecks,
  suggestions, updateAction, type ActionItem, type MappingRow, type MappingWorkspace, type ReportIssue, type ReportModel,
} from '../src';

/** Module 12 · Prioritisation and action plan. */
const issue = (ruleId: string, extra: Partial<ReportIssue> = {}): ReportIssue => ({
  ruleId, category: 'technical', severity: 'high', status: 'fail',
  title: { client: `Fix ${ruleId}`, expert: ruleId }, message: { client: `${ruleId} found on 4 pages`, expert: '' }, explain: { client: '', expert: '' }, fix: { client: 'Do the fix.', expert: '' },
  affectedCount: 4, applicableCount: 10, urls: ['https://site.com/a/', 'https://site.com/b/'], ice: { impact: 4, confidence: 4, effort: 2 }, ...extra,
});
const report = (issues: ReportIssue[], auditId = 'a1'): ReportModel =>
  ({ auditId, overall: { score: 71, label: 'Needs work', afterFixes: 90 }, issues, pages: [{ url: 'https://site.com/a/', title: 'Page A', h1: 'A', words: 500, pageType: 'service', schemaTypes: [], links: [] }] }) as unknown as ReportModel;
const row = (clusterId: string, extra: Partial<MappingRow> = {}): MappingRow => ({
  clusterId, topic: clusterId, intent: 'commercial', priority: 20, volume: 500, url: null, urlLocked: false, reason: 'No page covers this topic', action: 'create', actionLocked: false,
  newPageType: 'service', primaryKeyword: clusterId.replace(/-/g, ' '), secondaryKeywords: [], currentPosition: null, targetPosition: 10, conflicts: [], drafts: null, linksToAdd: [],
  schemaNeeded: ['Service'], owner: null, status: 'todo', updatedAt: '', ...extra,
});
const mapping = (rows: MappingRow[]) => ({ domain: 'site.com', rows }) as unknown as MappingWorkspace;
let n = 0;
const newId = () => `id${++n}`;
const NOW = new Date('2026-11-17T10:00:00Z');

describe('suggestions and adding actions', () => {
  it('takes failed and warned issues plus page-plan rows, highest priority first, skipping info and passes', () => {
    const r = report([issue('1.5.1'), issue('2.1.3', { status: 'warn', severity: 'medium', ice: { impact: 2, confidence: 4, effort: 1 } }), issue('1.1.5', { severity: 'info' }), issue('2.2.1', { status: 'pass' })]);
    const s = suggestions(emptyActions('site.com'), r, mapping([row('heat-pump-installation'), row('ac-repair', { action: 'leave' })]));
    expect(s.map((x) => (x.source.kind === 'audit' ? x.source.ruleId : x.source.kind === 'mapping' ? x.source.clusterId : x.source.taskId))).toEqual(['1.5.1', '2.1.3', 'heat-pump-installation']);
    expect(s[0]!.priority).toBe(priorityOf(4, 4, 2));
    expect(s[2]!.title).toBe('Create a page for "heat pump installation"');
  });

  it('adds with a before-state, asks the client to approve new pages, and never adds the same finding twice', () => {
    const r = report([issue('1.5.1')]);
    const m = mapping([row('heat-pump-installation')]);
    const gsc = [{ url: 'https://site.com/a', clicks: 12, impressions: 300 }];
    let ws = addActions(emptyActions('site.com'), suggestions(emptyActions('site.com'), r, m), { report: r, gsc, newId, now: NOW });
    expect(ws.actions).toHaveLength(2);
    const audit = ws.actions.find((a) => a.source.kind === 'audit')!;
    expect(audit.before).toMatchObject({ auditId: 'a1', score: 71, affected: 4, applicable: 10, gsc: { clicks: 12, impressions: 300 } });
    expect(audit.before!.pages).toEqual([{ url: 'https://site.com/a/', title: 'Page A', h1: 'A' }]);
    expect(audit.approval).toBe('none');
    expect(audit.dueDate).toBe('2026-12-17');
    const create = ws.actions.find((a) => a.source.kind === 'mapping')!;
    expect(create.approval).toBe('client');
    expect(needsApproval(create, 'client')).toBe(true);
    expect(suggestions(ws, r, m)).toHaveLength(0);
    ws = addActions(ws, [fromMappingRow(row('heat-pump-installation'))], { newId, now: NOW });
    expect(ws.actions).toHaveLength(2);
  });
});

describe('roadmap buckets', () => {
  const mk = (i: number, extra: Partial<ActionItem> = {}): ActionItem =>
    ({ id: `b${i}`, priority: 30 - i, effort: 2, status: 'todo', bucket: 'd30', bucketLocked: false, createdAt: NOW.toISOString(), ...extra }) as ActionItem;
  it('spreads the plan over six months by priority (at least 5 a month); hard work moves later; a hand-picked month stays', () => {
    const list = Array.from({ length: 25 }, (_, i) => mk(i));
    list[1] = mk(1, { effort: 4 });
    list[24] = mk(24, { bucket: 'd30', bucketLocked: true });
    const out = assignBuckets(list);
    expect(out[0]!.bucket).toBe('d30');
    expect(out[1]!.bucket).toBe('d60');
    expect(out[12]!.bucket).toBe('d90');
    expect(out[22]!.bucket).toBe('d150');
    // 60 actions: 10 a month over all six months.
    const big = assignBuckets(Array.from({ length: 60 }, (_, i) => mk(i)));
    expect(big.map((a) => a.bucket).filter((b, i, all) => all.indexOf(b) === i)).toEqual(['d30', 'd60', 'd90', 'd120', 'd150', 'd180']);
    expect(big.filter((a) => a.bucket === 'd180')).toHaveLength(10);
    expect(out[24]!.bucket).toBe('d30');
  });
});

describe('status, approval and verification', () => {
  const base = () => addActions(emptyActions('site.com'), suggestions(emptyActions('site.com'), report([issue('1.5.1')]), null), { report: report([issue('1.5.1')]), newId, now: NOW });

  it('done starts checks at 7, 14 and 28 days; reopening clears them', () => {
    let ws = base();
    const id = ws.actions[0]!.id;
    ws = updateAction(ws, id, { status: 'done', owner: '  Ali  ', dueDate: 'soon' }, NOW);
    const a = ws.actions[0]!;
    expect(a.owner).toBe('Ali');
    expect(a.dueDate).toBeNull();
    expect(a.checkpoints.map((c) => [c.day, c.dueAt.slice(0, 10)])).toEqual([[7, '2026-11-24'], [14, '2026-12-01'], [28, '2026-12-15']]);
    expect(actionSummary(ws)).toMatchObject({ open: 0, done: 1 });
    expect(openActions(ws)).toHaveLength(0);
    ws = updateAction(ws, id, { status: 'in_progress' }, NOW);
    expect(ws.actions[0]!.checkpoints).toEqual([]);
  });

  it('records who approved', () => {
    let ws = base();
    ws = updateAction(ws, ws.actions[0]!.id, { approval: 'team_lead' }, NOW);
    expect(needsApproval(ws.actions[0]!)).toBe(true);
    ws = updateAction(ws, ws.actions[0]!.id, { approve: { by: 'Sara' } }, NOW);
    expect(ws.actions[0]).toMatchObject({ approvedBy: 'Sara' });
    expect(needsApproval(ws.actions[0]!)).toBe(false);
  });

  it('judges a checkpoint from the newest audit and clicks against the rest of the site', () => {
    const done = updateAction(base(), 'id' + n, { status: 'done' }, NOW).actions.at(-1)!;
    const later = { finishedAt: '2026-11-20T00:00:00Z' };
    expect(judgeCheckpoint(done, { report: report([], 'a2'), ...later }, null, NOW).verdict).toBe('fixed');
    expect(judgeCheckpoint(done, { report: report([issue('1.5.1', { affectedCount: 2 })], 'a2'), ...later }, null, NOW).verdict).toBe('improved');
    expect(judgeCheckpoint(done, { report: report([issue('1.5.1', { affectedCount: 6 })], 'a2'), ...later }, null, NOW).verdict).toBe('worse');
    // An audit from before the fix does not count.
    const old = judgeCheckpoint(done, { report: report([], 'a0'), finishedAt: '2026-11-01T00:00:00Z' }, null, NOW);
    expect(old.verdict).toBe('waiting');
    const clicks = judgeCheckpoint(done, { report: null, finishedAt: null }, { targetBefore: 10, targetAfter: 15, controlBefore: 100, controlAfter: 102 }, NOW);
    expect(clicks).toMatchObject({ verdict: 'improved', targetChange: 50, controlChange: 2 });
  });

  it('runs due checks and marks verified after a good 28-day result', async () => {
    let ws = base();
    ws = updateAction(ws, ws.actions[0]!.id, { status: 'done' }, NOW);
    const at = (d: number) => new Date(NOW.getTime() + d * 86_400_000);
    expect(hasDueChecks(ws, at(6))).toBe(false);
    const day7 = await runChecks(ws, async () => judgeCheckpoint(ws.actions[0]!, { report: null, finishedAt: null }, null, at(7)), at(7));
    expect(day7).toMatchObject({ checked: 1, verified: 0 });
    expect(day7.ws.actions[0]!.status).toBe('done');
    const day30 = await runChecks(day7.ws, async (a) => judgeCheckpoint(a, { report: report([], 'a3'), finishedAt: at(29).toISOString() }, null, at(30)), at(30));
    expect(day30).toMatchObject({ checked: 2, verified: 1 });
    expect(day30.ws.actions[0]!.status).toBe('verified');
    expect(hasDueChecks(day30.ws, at(40))).toBe(false);
  });

  it('exports CSV safe from formulas', () => {
    let ws = base();
    ws = updateAction(ws, ws.actions[0]!.id, { title: '=HYPERLINK("x")' }, NOW);
    const csv = actionsToCsv(ws);
    expect(csv.split('\r\n')[0]).toContain('priority,title,severity');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
