import { describe, expect, it } from 'vitest';
import { issuesToCsv, sampleReport, type ReportModel } from '../src';

describe('issuesToCsv', () => {
  it('writes one row per affected URL, for one issue or all', () => {
    const one = issuesToCsv(sampleReport, '1.5.1')!;
    const lines = one.replace('\uFEFF', '').trim().split('\r\n');
    expect(lines[0]).toBe('rule_id,check,severity,status,affected,of,url,finding,how_to_fix');
    expect(lines).toHaveLength(1 + 4);
    expect(lines[1]).toContain('https://www.summitairhvac.com/services/duct-cleaning-old/');
    const all = issuesToCsv(sampleReport)!.trim().split('\r\n');
    expect(all).toHaveLength(1 + 4 + 12);
    expect(issuesToCsv(sampleReport, '9.9.9')).toBeNull();
  });

  it('quotes commas and quotes, and neutralises spreadsheet formulas', () => {
    const r: ReportModel = {
      ...sampleReport,
      issues: [{ ...sampleReport.issues![0]!, title: { client: 'x', expert: 'Says "hi", twice' }, urls: ['=HYPERLINK("http://evil")'] }],
    };
    const row = issuesToCsv(r)!.trim().split('\r\n')[1]!;
    expect(row).toContain('"Says ""hi"", twice"');
    expect(row).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe('summaryHeadline', () => {
  it('is red only with critical issues and says so when there are none', async () => {
    const { summaryHeadline } = await import('../src');
    const r = (critical: number, high: number) => ({ overall: { ...sampleReport.overall, label: 'Needs work' as const }, severityCounts: { critical, high, medium: 3, low: 1 } });
    expect(summaryHeadline(r(2, 1))).toEqual({ tone: 'critical', title: 'Needs work: 2 critical issues need attention' });
    expect(summaryHeadline(r(0, 1))).toEqual({ tone: 'high', title: 'Needs work: no critical issues, 1 high-priority issue to fix' });
    expect(summaryHeadline(r(0, 0))).toEqual({ tone: 'good', title: 'Needs work: no critical or high-priority issues' });
  });
});
