import { zipStore } from '../report/xlsx';
import type { ActionItem, ActionWorkspace } from './actions';
import type { StoredAiPlan } from './ai-plan';
import { validationText } from './plan-validate';

/**
 * The plan's files, built from the saved plan: plan.md, plan.json, page_meta.csv (rule 11), issue_register.csv, keyword_map.csv,
 * needs_developer.md, data_gaps.md and validation.txt, one at a time or together as a .zip.
 */
export const PLAN_FILES = ['plan.md', 'plan.json', 'page_meta.csv', 'issue_register.csv', 'keyword_map.csv', 'needs_developer.md', 'data_gaps.md', 'validation.txt'] as const;
export type PlanFile = (typeof PLAN_FILES)[number];

// CSV cells never start a formula (=, +, -, @) and quote commas, quotes and line breaks.
const cell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('; ') : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

function planTasks(ws: ActionWorkspace, plan: StoredAiPlan): ActionItem[] {
  return ws.actions
    .filter((a) => a.source.kind === 'ai' && a.source.planId === plan.id && a.plan)
    .sort((a, b) => a.plan!.month - b.plan!.month || a.plan!.taskId.localeCompare(b.plan!.taskId, 'en', { numeric: true }));
}

export function planFile(ws: ActionWorkspace, name: PlanFile): string | null {
  const plan = ws.aiPlan;
  if (!plan) return null;
  const tasks = planTasks(ws, plan);
  switch (name) {
    case 'plan.json':
      return JSON.stringify({
        website: ws.domain, start_date: plan.startDate, generated_at: plan.generatedAt, business: plan.business ?? null, summary: plan.summary,
        baseline_and_targets: plan.baseline_and_targets,
        months: plan.months.map((m) => ({
          month: m.month, theme: m.theme, goal: m.goal,
          tasks: tasks.filter((t) => t.plan!.month === m.month).map((t) => ({
            id: t.plan!.taskId, month: t.plan!.month, week: t.plan!.week, title: t.title, category: t.plan!.category === 'ai_visibility' ? 'aeo' : t.plan!.category, why: t.plan!.why,
            urls: t.urls, keywords: t.plan!.keywords, what_changes: t.plan!.change, doer: t.plan!.doer, impact: t.impact, confidence: t.confidence, effort: t.effort,
            priority: t.priority, depends_on: t.plan!.dependsOn, success_measure: t.plan!.successCheck, check_after_days: t.plan!.checkAfterDays,
            issue_ids: t.plan!.issueIds ?? [], recurring: Boolean(t.plan!.recurring), due_date: t.dueDate, status: t.status,
          })),
        })),
        later: plan.later, needs_developer: plan.needsDeveloper ?? [], data_gaps: plan.data_gaps, notes: plan.notes,
      }, null, 2);
    case 'plan.md': {
      const out = [`# 6-month SEO plan: ${ws.domain}`, '', `Start date: ${plan.startDate} · written ${plan.generatedAt.slice(0, 10)}`, '', plan.summary, ''];
      if (plan.baseline_and_targets.length) {
        out.push('## Baseline and targets', '', '| What we measure | Now | Month 3 | Month 6 |', '| --- | --- | --- | --- |');
        for (const r of plan.baseline_and_targets) out.push(`| ${r.metric} | ${r.now} | ${r.month_3_target} | ${r.month_6_target} |`);
        out.push('');
      }
      for (const m of plan.months) {
        out.push(`## Month ${m.month}: ${m.theme || ''}`.trimEnd(), '', m.goal, '');
        for (const t of tasks.filter((x) => x.plan!.month === m.month)) {
          out.push(`- **${t.plan!.taskId} · week ${t.plan!.week} · ${t.title}** (${t.owner ?? ''})`, `  ${t.plan!.why}`, t.plan!.change ? `  What changes: ${t.plan!.change}` : '', `  How we know it worked: ${t.plan!.successCheck} (after ${t.plan!.checkAfterDays} days)`);
        }
        out.push('');
      }
      if (plan.later.length) out.push('## Later', '', ...plan.later.map((l) => `- ${l.title}: ${l.reason_deferred}`), '');
      return out.filter((l) => l !== '').join('\n').replace(/\n(## )/g, '\n\n$1') + '\n';
    }
    case 'page_meta.csv':
      return csv(['url', 'new_title', 'title_length', 'new_meta_description', 'meta_length'],
        (plan.pageMeta ?? []).map((r) => [r.url, r.title, /^keep$/i.test(r.title) ? '' : r.title.length, r.description, /^keep$/i.test(r.description) ? '' : r.description.length]));
    case 'issue_register.csv':
      return csv(
        ['issue_id', 'issue', 'severity', 'affected_url_count', 'example_urls', 'fix', 'scheduled_in'],
        (plan.issues ?? []).map((i) => [i.issue_id, i.issue, i.severity, i.affected_url_count, i.example_urls, i.fix,
          tasks.filter((t) => t.plan!.issueIds?.includes(i.issue_id) || (i.item && t.plan!.siteWideItem === i.item)).map((t) => t.plan!.taskId)
            .concat((plan.needsDeveloper ?? []).some((n) => n.issue_id === i.issue_id) ? ['needs developer'] : [])]),
      );
    case 'keyword_map.csv':
      return csv(['url', 'main_keyword', 'supporting_keywords', 'volume', 'position', 'removed_reason'], [
        ...plan.page_map.map((p) => [p.url, p.main_keyword, p.supporting_keywords, p.total_monthly_volume, '', '']),
        ...plan.removed_keywords.map((k) => ['', k.keyword, '', '', '', k.reason]),
      ]);
    case 'needs_developer.md': {
      const nd = plan.needsDeveloper ?? [];
      return [`# Needs a developer: ${ws.domain}`, '', 'Issues with no no-code fix, left out of the plan (rule 3).', '', ...(nd.length ? nd.map((n) => `- **${n.issue_id || '—'}** ${n.issue}: ${n.reason}`) : ['- none']), ''].join('\n');
    }
    case 'data_gaps.md':
      return [`# Data gaps: ${ws.domain}`, '', ...(plan.data_gaps.length ? plan.data_gaps.map((g) => `- ${g}`) : ['- none']), '', '## What the checks changed', '', ...(plan.notes.length ? plan.notes.map((n) => `- ${n}`) : ['- nothing']), ''].join('\n');
    case 'validation.txt':
      return plan.validation ? validationText(plan.validation) + '\n' : 'This plan was written before the validation checks existed.\n';
  }
}

export function planZip(ws: ActionWorkspace): Uint8Array | null {
  if (!ws.aiPlan) return null;
  const enc = new TextEncoder();
  return zipStore(PLAN_FILES.map((name) => ({ name: `output/${name}`, data: enc.encode(planFile(ws, name) ?? '') })));
}
