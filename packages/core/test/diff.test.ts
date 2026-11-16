import { describe, expect, it } from 'vitest';
import { diffReports, sampleReport, type ReportIssue, type ReportModel } from '../src';

const issue = (ruleId: string, severity: ReportIssue['severity'], affectedCount?: number, status: ReportIssue['status'] = 'fail'): ReportIssue => ({
  ruleId, category: 'technical', severity, status, affectedCount,
  title: { client: ruleId, expert: ruleId }, message: { client: '', expert: '' }, explain: { client: '', expert: '' }, fix: { client: '', expert: '' },
  urls: [], ice: { impact: 1, confidence: 1, effort: 1 },
});

const report = (score: number, issues: ReportIssue[], over: Partial<ReportModel> = {}): ReportModel => ({
  ...sampleReport, overall: { ...sampleReport.overall, score }, issues, ...over,
});

describe('diffReports', () => {
  it('finds new, fixed, worse and better issues, most severe first', () => {
    const before = report(70, [issue('1.5.1', 'high', 5), issue('2.1.1', 'high', 3), issue('1.6.1', 'medium', 10), issue('2.4.9', 'low', 2)]);
    const after = report(78, [issue('1.5.1', 'high', 8), issue('1.6.1', 'medium', 4), issue('1.2.2', 'critical'), issue('2.5.1', 'low', 1), issue('1.3.1', 'info', undefined, 'info')]);
    const d = diffReports(before, after);
    expect(d.scoreBefore).toBe(70);
    expect(d.scoreAfter).toBe(78);
    expect(d.added.map((c) => c.issue.ruleId)).toEqual(['1.2.2', '2.5.1']);
    expect(d.fixed.map((c) => c.issue.ruleId)).toEqual(['2.1.1', '2.4.9']);
    expect(d.worse).toMatchObject([{ issue: { ruleId: '1.5.1' }, before: 5, after: 8 }]);
    expect(d.better).toMatchObject([{ issue: { ruleId: '1.6.1' }, before: 10, after: 4 }]);
    expect(d.caveat).toBeUndefined();
  });

  it('warns when the audits are not like for like', () => {
    const d = diffReports(report(60, [], { auditMode: 'deep', crawlLimit: 50 }), report(65, [], { auditMode: 'quick', crawlLimit: 10, gscProperty: 'sc-domain:x.com' }));
    expect(d.caveat).toContain('different audit types');
    expect(d.caveat).toContain('different page limits');
    expect(d.caveat).toContain('Search Console');
  });
});
