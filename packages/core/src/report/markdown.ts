import type { Audience, ReportIssue, ReportModel, Severity } from '../types';

/**
 * Markdown export of a report. Written to be pasted into an AI coding agent (or read
 * over MCP) as a fix list: every issue has a checkbox, the evidence, the fix and URLs.
 */

const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
const CLIENT_URL_LIMIT = 5;

const cell = (s: string | number) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const date = (iso: string) => new Date(iso).toISOString().slice(0, 10);

function duration(s: number): string {
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(Math.round(s % 60)).padStart(2, '0')}s` : `${Math.round(s)}s`;
}

/** Older reports have no `issues`; rebuild a minimal list from topIssues. */
function issuesOf(report: ReportModel): ReportIssue[] {
  if (report.issues) return report.issues;
  return report.topIssues.map((t) => ({
    ruleId: t.ruleId, category: t.category, severity: t.severity, status: 'fail', title: t.title, message: t.title,
    explain: t.sub, fix: { client: '', expert: '' }, urls: [], ice: t.ice,
  }));
}

function issueBlock(i: ReportIssue, n: number, mode: Audience): string {
  const expert = mode === 'expert';
  const head = expert ? `${i.ruleId} · ${SEVERITY_LABEL[i.severity]} · ${i.title.expert}` : `${SEVERITY_LABEL[i.severity]} · ${i.message.client}`;
  const lines = [`### ${n}. [ ] ${head}`, ''];
  if (expert) lines.push(`- **Found:** ${i.message.expert}`);
  if (i.explain[mode]) lines.push(`- **Why it matters:** ${i.explain[mode]}`);
  if (i.fix[mode]) lines.push(`- **How to fix:** ${i.fix[mode]}`);
  if (expert) lines.push(`- **Priority (ICE):** impact ${i.ice.impact} · confidence ${i.ice.confidence} · effort ${i.ice.effort}`);
  const urls = expert ? i.urls : i.urls.slice(0, CLIENT_URL_LIMIT);
  if (urls.length) {
    const count = i.affectedCount ?? i.urls.length;
    lines.push(`- **Affected${i.applicableCount ? ` (${count} of ${i.applicableCount})` : ` (${count})`}:**`);
    for (const u of urls) lines.push(`  - ${u}`);
    if (count > urls.length) lines.push(`  - …and ${count - urls.length} more`);
  }
  return lines.join('\n');
}

export function reportToMarkdown(report: ReportModel, mode: Audience): string {
  const expert = mode === 'expert';
  const issues = issuesOf(report);
  const sc = report.severityCounts;
  const out: string[] = [];

  out.push(`# SEO audit: ${report.project.domain}`, '');
  out.push(`${report.brand} · ${expert ? 'SEO expert report' : 'Client report'} · ${date(report.crawledAt)}`, '');
  out.push('| | |', '|---|---|');
  out.push(`| URL | ${cell(report.url)} |`);
  out.push(`| Pages audited | ${report.pagesCrawled} of ${report.crawlLimit} |`);
  out.push(`| Health score | ${report.overall.score}/100 (${report.overall.label}), ${report.overall.afterFixes} after fixing critical and high issues |`);
  out.push(`| Issues | ${sc.critical} critical · ${sc.high} high · ${sc.medium} medium · ${sc.low} low |`);
  if (report.durationSeconds !== undefined) out.push(`| Audit time | ${duration(report.durationSeconds)} |`);
  out.push('');

  if (expert) {
    out.push(
      '> **Using this file with an AI agent:** work through "Issues to fix" from top to bottom.',
      '> Each issue lists what was found, why it matters, how to fix it and every affected URL.',
      '> Tick the box when done, then re-run the audit to verify. Rule ids refer to the Morosoft SEO checklist.',
      '',
    );
  }

  for (const n of report.notices ?? []) out.push(`> **Note:** ${n[mode]}`, '');

  out.push('## Scores by category', '', '| Category | Score |', '|---|---|');
  for (const c of report.categories) out.push(`| ${cell(c.label)} | ${c.score} |`);
  out.push('');

  if (report.cwv) {
    out.push(`## Core Web Vitals (mobile, ${report.cwv.source === 'field' ? 'real-user data' : 'lab data'})`, '', '| Metric | Value | Target | Rating |', '|---|---|---|---|');
    for (const m of report.cwv.metrics) out.push(`| ${cell(m.label)} | ${cell(m.value)} | ${cell(m.threshold)} | ${m.rating.replace(/-/g, ' ')} |`);
    out.push('');
  }

  if (report.ai) {
    out.push('## AI recommendations', '', `_Written by ${report.ai.model} from the findings below. Check before acting._`, '', report.ai.summary[mode], '');
    report.ai.items.forEach((r, idx) => {
      const meta = [`impact ${r.impact}`, `effort ${r.effort}`, ...(expert && r.ruleIds.length ? [`rules ${r.ruleIds.join(', ')}`] : [])];
      out.push(`### ${idx + 1}. ${r.title}`, '', `_${meta.join(' · ')}_`, '', r.why, '');
      r.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`));
      out.push('');
    });
  }

  out.push('## Issues to fix', '');
  if (issues.length === 0) out.push('No issues found.', '');
  issues.forEach((i, idx) => out.push(issueBlock(i, idx + 1, mode), ''));

  if (report.robots.suggested) {
    out.push('## Suggested robots.txt', '', '```txt', report.robots.suggested.trim(), '```', '');
  }

  if (expert) {
    const passed = [...report.robots.rows, ...report.sitemap.rows, ...report.cards.flatMap((c) => c.rows)].filter((r) => r.status === 'pass');
    if (passed.length) {
      out.push('## Passed checks', '');
      for (const r of passed) out.push(`- ${r.ruleId}: ${r.message.expert}`);
      out.push('');
    }
  }

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
