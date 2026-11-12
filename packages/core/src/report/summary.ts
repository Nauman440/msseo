import type { AudienceText, ReportModel, TopIssue } from '../types';

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** One-sentence summary for the red alert banner, built from the top 3 issues. */
export function buildSummary(report: Pick<ReportModel, 'overall' | 'topIssues'>): AudienceText {
  const top: TopIssue[] = report.topIssues.slice(0, 3);
  if (top.length === 0) {
    return {
      client: 'No major problems found. Keep the site maintained and re-check monthly.',
      expert: 'No critical or high-severity rules failed in this audit.',
    };
  }
  const client = joinList(top.map((i) => lowerFirst(i.title.client)));
  const expert = joinList(top.map((i) => `${lowerFirst(i.title.expert)} (${i.ruleId})`));
  return {
    client: `Your site scores ${report.overall.score}/100. The biggest problems: ${client}.`,
    expert: `Overall ${report.overall.score}/100 (${report.overall.label}). Highest-priority failures: ${expert}.`,
  };
}
