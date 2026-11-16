import type { ReportIssue, ReportModel } from '../types';

/**
 * "What changed since the last audit" (spec Phase 3): compares the issue lists of two
 * completed reports of the same project, matched by rule id.
 */
export type IssueChange = { issue: ReportIssue; before?: number; after?: number };

export type ReportDiff = {
  scoreBefore: number;
  scoreAfter: number;
  /** Failing or warning now, not in the previous audit. */
  added: IssueChange[];
  /** In the previous audit, gone now. */
  fixed: IssueChange[];
  /** Still open, with more affected pages/items than before. */
  worse: IssueChange[];
  /** Still open, with fewer affected pages/items than before. */
  better: IssueChange[];
  /** Caveat when the two audits are not like for like (different type or page limit). */
  caveat?: string;
};

const RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
const bySeverity = (a: IssueChange, b: IssueChange) => RANK[a.issue.severity] - RANK[b.issue.severity];
const open = (r: ReportModel) => new Map((r.issues ?? []).filter((i) => i.status === 'fail' || i.status === 'warn').map((i) => [i.ruleId, i]));

export function diffReports(previous: ReportModel, latest: ReportModel): ReportDiff {
  const before = open(previous);
  const after = open(latest);
  const added: IssueChange[] = [];
  const worse: IssueChange[] = [];
  const better: IssueChange[] = [];
  for (const [id, issue] of after) {
    const old = before.get(id);
    if (!old) {
      added.push({ issue, after: issue.affectedCount });
      continue;
    }
    const a = old.affectedCount;
    const b = issue.affectedCount;
    if (a !== undefined && b !== undefined && a !== b) (b > a ? worse : better).push({ issue, before: a, after: b });
  }
  const fixed = [...before].filter(([id]) => !after.has(id)).map(([, issue]) => ({ issue, before: issue.affectedCount }));

  const caveats: string[] = [];
  if ((previous.auditMode ?? 'deep') !== (latest.auditMode ?? 'deep')) caveats.push('the two audits used different audit types');
  if (previous.crawlLimit !== latest.crawlLimit) caveats.push('the two audits used different page limits');
  if (Boolean(previous.gscProperty) !== Boolean(latest.gscProperty)) caveats.push('only one of them used Search Console');

  return {
    scoreBefore: previous.overall.score,
    scoreAfter: latest.overall.score,
    added: added.sort(bySeverity),
    fixed: fixed.sort(bySeverity),
    worse: worse.sort(bySeverity),
    better: better.sort(bySeverity),
    caveat: caveats.length ? `Some differences may come from setup, not the site: ${caveats.join(', ')}.` : undefined,
  };
}
