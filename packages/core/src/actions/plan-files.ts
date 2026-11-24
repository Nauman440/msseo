import { zipStore } from '../report/xlsx';
import type { ActionItem, ActionWorkspace } from './actions';
import type { StoredAiPlan } from './ai-plan';
import { AREA_LABEL, type AuditArea } from './plan-pipeline';
import { validationText } from './plan-validate';

/**
 * The strategist prompt's ./output folder, built from the saved plan: plan.md, plan.json, page_fixes.csv,
 * issue_register.csv, audit_checklist.md, keyword_map.csv, offpage_programme.md, data_gaps.md and
 * validation.txt, one at a time or together as a .zip.
 */
export const PLAN_FILES = ['plan.md', 'plan.json', 'page_fixes.csv', 'issue_register.csv', 'audit_checklist.md', 'keyword_map.csv', 'offpage_programme.md', 'data_gaps.md', 'validation.txt'] as const;
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
            id: t.plan!.taskId, month: t.plan!.month, week: t.plan!.week, title: t.title, area: t.plan!.area ?? '', category: t.plan!.category, why: t.plan!.why,
            urls: t.urls, keywords: t.plan!.keywords, what_changes: t.plan!.change, doer: t.plan!.doer, impact: t.impact, confidence: t.confidence, effort: t.effort,
            priority: t.priority, depends_on: t.plan!.dependsOn, success_measure: t.plan!.successCheck, check_after_days: t.plan!.checkAfterDays,
            issue_ids: t.plan!.issueIds ?? [], recurring: Boolean(t.plan!.recurring), due_date: t.dueDate, status: t.status,
          })),
        })),
        later: plan.later, data_gaps: plan.data_gaps, notes: plan.notes,
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
    case 'page_fixes.csv':
      return csv(
        ['url', 'page_type', 'main_keyword', 'current_title', 'new_title', 'title_length', 'current_meta', 'new_meta', 'meta_length', 'current_h1s', 'new_h1', 'h1_fix', 'current_canonical', 'correct_canonical', 'canonical_action', 'images_total', 'images_missing_alt', 'alt_fixes', 'other_fixes', 'priority', 'note'],
        (plan.pageFixes ?? []).map((r) => {
          const title = /^keep$/i.test(r.new_title.trim()) ? r.current_title : r.new_title;
          const meta = /^keep$/i.test(r.new_meta.trim()) ? r.current_meta : r.new_meta;
          return [r.url, r.page_type, r.main_keyword, r.current_title, r.new_title, title?.length ?? '', r.current_meta, r.new_meta, meta?.length ?? '', r.current_h1s, r.new_h1, r.h1_fix, r.current_canonical, r.correct_canonical, r.canonical_action,
            r.images_total, r.images_missing_alt, r.alt_fixes.map((a) => `${a.image} → ${a.alt || '""'}${a.verify ? ' (verify)' : ''}`), r.other_fixes, r.priority, r.note ?? ''];
        }),
      );
    case 'issue_register.csv':
      return csv(
        ['issue_id', 'area', 'issue', 'severity', 'affected_url_count', 'example_urls', 'fix', 'impact', 'confidence', 'effort', 'priority', 'doer', 'scheduled_in'],
        (plan.issues ?? []).map((i) => [i.issue_id, `${i.area} ${AREA_LABEL[i.area as AuditArea] ?? ''}`.trim(), i.issue, i.severity, i.affected_url_count, i.example_urls, i.fix, i.impact, i.confidence, i.effort, i.priority ?? '', i.doer,
          tasks.filter((t) => t.plan!.issueIds?.includes(i.issue_id)).map((t) => t.plan!.taskId)]),
      );
    case 'audit_checklist.md': {
      const out = [`# Audit checklist: ${ws.domain}`, ''];
      for (const area of Object.keys(AREA_LABEL) as AuditArea[]) {
        const lines = (plan.checklist ?? []).filter((c) => c.area === area);
        if (!lines.length) continue;
        out.push(`## ${area}. ${AREA_LABEL[area]}`, '', '| Check | Status | Severity | Evidence |', '| --- | --- | --- | --- |');
        for (const c of lines) out.push(`| ${c.item.replace(/\|/g, '/')} | ${c.status} | ${c.severity} | ${c.evidence.replace(/\|/g, '/')} |`);
        out.push('');
      }
      return out.join('\n');
    }
    case 'keyword_map.csv':
      return csv(['url', 'main_keyword', 'supporting_keywords', 'volume', 'position', 'removed_reason'], [
        ...plan.page_map.map((p) => [p.url, p.main_keyword, p.supporting_keywords, p.total_monthly_volume, '', '']),
        ...plan.removed_keywords.map((k) => ['', k.keyword, '', '', '', k.reason]),
      ]);
    case 'offpage_programme.md': {
      const out = [`# Off-page programme: ${ws.domain}`, ''];
      for (let m = 1; m <= 6; m++) {
        const items = (plan.offpage ?? []).filter((o) => Math.round(o.month) === m);
        out.push(`## Month ${m}`, '', ...(items.length ? items.map((o) => `- **${o.title}** (${o.monthly_number}): ${o.method}${o.targets.length ? ` Targets: ${o.targets.join(', ')}.` : ''}`) : ['- no programme items']), '');
      }
      return out.join('\n');
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
