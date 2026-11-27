import { orderTasks, SITE_TASK, taskProgress, type ActionItem, type TaskState, type WorkItem } from '@seo/core';
import type { AutopilotState } from '@/lib/autopilot-wp';
import { cn } from '@/lib/tones';

/**
 * Plan executor, part D: the plan's open tasks in the order they are done, each with where it stands
 * (Queued, Preparing changes, Applying 12 of 54, Done & verified, Needs you, Failed, Manual) and every
 * change it makes with before, after and when it was applied. Below: the execution log.
 */
const TONE: Record<TaskState, string> = {
  queued: 'bg-sunken text-ink-2',
  preparing: 'bg-primary-wash text-primary-text',
  applying: 'bg-primary-wash text-primary-text',
  done: 'bg-pass-bg text-pass-text',
  needs_you: 'bg-warn-bg text-warn-text',
  failed: 'bg-fail-bg text-fail-text',
  manual: 'bg-sunken text-ink-2',
  waiting: 'bg-sunken text-ink-2',
  later: 'bg-sunken text-ink-2',
};
const ITEM: Record<string, string> = { draft: 'Ready', keep: 'Already right', needs_human: 'Needs you', skipped: 'Skipped', team: 'Our team', client: 'You', developer: 'Developer', applied: 'Applied', verified: 'Verified', failed: 'Failed', rolled_back: 'Undone', scheduled: 'Scheduled' };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : null);
const text = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const o = v as Record<string, unknown>;
  for (const k of ['text', 'alt', 'to', 'title', 'html', 'content', 'line', 'action']) if (typeof o[k] === 'string') return String(o[k]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  return null;
};

function Items({ list }: { list: WorkItem[] }) {
  if (!list.length) return null;
  return (
    <ul className="divide-y divide-border border-t border-border text-[13px]">
      {list.map((i) => (
        <li key={i.id} className="grid gap-1 px-4 py-2 sm:grid-cols-[1fr_auto]">
          <span className="min-w-0 break-words">
            <span className="font-semibold">{i.label}</span>
            {text(i.before) && <span className="block text-ink-2">Before: {text(i.before)}</span>}
            {text(i.newValue) && i.status !== 'keep' && <span className="block">After: {text(i.newValue)}</span>}
            {i.reason && <span className="block text-ink-2">{i.reason}</span>}
          </span>
          <span className="text-ink-2 sm:text-right">{ITEM[i.status] ?? i.status}{i.appliedAt ? ` · ${when(i.appliedAt)}` : ''}</span>
        </li>
      ))}
    </ul>
  );
}

export function TaskQueue({ actions, month, state: s, busyStep }: { actions: ActionItem[]; month: number; state: AutopilotState; busyStep: string | null }) {
  const tasks = orderTasks(actions, month);
  const site = s.items.filter((i) => i.actionId === SITE_TASK);
  if (!tasks.length && !site.length) return null;
  const preparing = busyStep?.startsWith('Preparing') ?? false;
  return (
    <details open className="rounded-[14px] border border-border">
      <summary className="cursor-pointer px-5 py-3 font-semibold">Tasks in the order they are done <span className="text-ink-2 tabular">({tasks.length})</span></summary>
      <ol className="flex flex-col divide-y divide-border border-t border-border">
        {site.length > 0 && (
          <li>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="font-semibold">Site essentials (sitemap, llms.txt, headings)</span>
                <span className="rounded-pill bg-sunken px-2.5 py-0.5 text-[12px] font-semibold text-ink-2">{site.filter((i) => ['verified', 'keep'].includes(i.status)).length} of {site.length} done</span>
              </summary>
              <Items list={site} />
            </details>
          </li>
        )}
        {tasks.map((a, n) => {
          const p = taskProgress(a, s.items, { preparing, actions });
          const mine = s.items.filter((i) => i.actionId === a.id);
          return (
            <li key={a.id}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="min-w-0 break-words">
                    <span className="mr-2 text-ink-3 tabular">{n + 1}.</span>
                    <span className="font-semibold">{a.title}</span>
                    <span className="block text-[12px] text-ink-2">Month {a.plan?.month ?? '–'}{a.plan?.week ? `, week ${a.plan.week}` : ''} · {a.severity}{a.exec ? ` · ${a.exec.actionType.replace(/_/g, ' ')}` : ''}</span>
                  </span>
                  <span className={cn('rounded-pill px-2.5 py-0.5 text-[12px] font-semibold', TONE[p.state])}>{p.label}</span>
                </summary>
                {mine.length ? <Items list={mine} /> : <p className="border-t border-border px-5 py-3 text-[13px] text-ink-2">No changes prepared yet. They are drafted on the next run.</p>}
              </details>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

export function ExecutionLog({ state: s }: { state: AutopilotState }) {
  const runs = s.runs.slice(0, 10);
  if (!runs.length) return null;
  return (
    <details className="rounded-[14px] border border-border">
      <summary className="cursor-pointer px-5 py-3 font-semibold">Execution log</summary>
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-sunken text-ink-2"><tr><th className="px-4 py-2 font-semibold">When</th><th className="px-4 py-2 font-semibold">Tasks</th><th className="px-4 py-2 font-semibold tabular">Applied</th><th className="px-4 py-2 font-semibold tabular">Verified</th><th className="px-4 py-2 font-semibold tabular">Failed</th></tr></thead>
          <tbody className="divide-y divide-border">
            {runs.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-2">{when(r.finishedAt || r.startedAt)}{r.by ? ` · ${r.by}` : ''}</td>
                <td className="px-4 py-2">{(r.tasks ?? []).filter((t) => t.step === 'apply' || t.applied).map((t) => `${t.title} (${t.state})`).join('; ') || '—'}{r.paused ? ' · paused' : ''}{r.rolledBack ? ' · run undone' : ''}</td>
                <td className="px-4 py-2 tabular">{r.applied}</td>
                <td className="px-4 py-2 tabular">{r.verified + (r.reverified ?? 0)}</td>
                <td className="px-4 py-2 tabular">{r.failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
