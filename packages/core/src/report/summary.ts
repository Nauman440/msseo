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

/**
 * The report's headline and tone. Red only when there are critical issues; with none it
 * says so (orange for high-priority issues, green when nothing critical or high is left).
 */
export function summaryHeadline(report: Pick<ReportModel, 'overall' | 'severityCounts'>): { tone: 'critical' | 'high' | 'good'; title: string } {
  const { critical, high } = report.severityCounts;
  const label = report.overall.label;
  if (critical > 0) return { tone: 'critical', title: `${label}: ${critical} critical ${critical === 1 ? 'issue needs' : 'issues need'} attention` };
  if (high > 0) return { tone: 'high', title: `${label}: no critical issues, ${high} high-priority ${high === 1 ? 'issue' : 'issues'} to fix` };
  return { tone: 'good', title: `${label}: no critical or high-priority issues` };
}
