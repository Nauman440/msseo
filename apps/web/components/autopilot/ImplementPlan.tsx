import Link from 'next/link';
import type { ActionItem, WorkItem } from '@seo/core';
import { Preparing } from '@/components/customer/Preparing';
import type { AutopilotState } from '@/lib/autopilot-wp';
import { AutopilotSchedule, resultText } from './AutopilotSchedule';
import { ApproveButton, PauseButton, RunNextTaskButton, StartImplementingButton, UndoItemButton } from './forms';
import { ExecutionLog, TaskQueue } from './TaskQueue';

/**
 * "Start implementing plan": makes this month's website changes through the WordPress plugin and
 * shows what happened to each one (made, already right, needs a person, someone else's task).
 */
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const INTERNAL: Record<string, string> = { gsc_sitemap_submit: 'MS SCORE submits it to Search Console after each run', ai_visibility_check: 'MS SCORE checks AI assistants', weekly_page_check: 'MS SCORE checks every week' };

function valueText(i: WorkItem): string | null {
  const v = i.newValue as Record<string, unknown> | string | null;
  if (typeof v === 'string') return v;
  if (!v) return null;
  if (typeof v.alt === 'string') return `Alt text: ${v.alt}`;
  if (typeof v.html === 'string') return v.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (Array.isArray(v.faq)) return (v.faq as { q: string; a: string }[]).map((f) => `${f.q} ${f.a}`).join(' · ');
  if (typeof v.to === 'string') return `→ ${v.to}`;
  if (v.action === 'demote_extra_h1') return 'Turn the extra H1 headings into H2s';
  if (v.action === 'add_h1') return `Add the H1 “${String(v.text)}”`;
  if (typeof v.title === 'string') return `Sharing title: ${v.title}`;
  if (v.json) return 'Structured data (JSON-LD)';
  return null;
}

function Row({ i, domain, undo, approve }: { i: WorkItem; domain: string; undo?: boolean; approve?: boolean }) {
  const before = typeof i.before === 'string' ? i.before : null;
  const value = valueText(i);
  const result = resultText(i);
  return (
    <li className="flex flex-col gap-1 px-5 py-3 text-[14px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{i.label}</span>
        {undo && <UndoItemButton domain={domain} id={i.id} />}
        {approve && !i.approvedAt && <ApproveButton domain={domain} ids={[i.id]} label="Approve" />}
        {approve && i.approvedAt && <span className="text-[13px] font-semibold text-pass-text">Approved</span>}
      </div>
      {before && value && i.status !== 'keep' && <p className="text-ink-2"><span className="font-semibold">Before:</span> {before}</p>}
      {value && i.status !== 'keep' && <p><span className="font-semibold">{i.status === 'needs_human' ? 'Drafted:' : 'Now:'}</span> {value}</p>}
      {i.status === 'keep' && before && <p className="text-ink-2">{before}</p>}
      {i.reason && <p className="text-[13px] text-ink-2">{i.reason}</p>}
      {result && <p className="text-[13px] font-semibold text-ink-2">{result}</p>}
    </li>
  );
}

function Group({ title, list, domain, undo, open, approve }: { title: string; list: WorkItem[]; domain: string; undo?: boolean; open?: boolean; approve?: boolean }) {
  if (!list.length) return null;
  const waiting = approve ? list.filter((i) => !i.approvedAt).length : 0;
  return (
    <details open={open} className="rounded-[14px] border border-border">
      <summary className="cursor-pointer px-5 py-3 font-semibold">{title} <span className="text-ink-2 tabular">({list.length})</span></summary>
      {waiting > 1 && <div className="border-t border-border px-5 py-3"><ApproveButton domain={domain} ids="all" label={`Approve all ${waiting}`} /></div>}
      <ul className="divide-y divide-border border-t border-border">{list.map((i) => <Row key={i.id} i={i} domain={domain} undo={undo} approve={approve} />)}</ul>
    </details>
  );
}

export function ImplementPlan({ domain, state: s, blocker, running, connectHref, audience, actions = [], month = 1 }: {
  domain: string;
  state: AutopilotState;
  /** The plan's tasks and this plan month, for the task queue. */
  actions?: ActionItem[];
  month?: number;
  blocker: string | null;
  running: boolean;
  connectHref: string;
  audience: 'team' | 'customer';
}) {
  const is = (...st: WorkItem['status'][]) => s.items.filter((i) => st.includes(i.status));
  const made = is('applied', 'verified', 'rolled_back');
  const last = s.runs[0];
  const busy = running || s.status === 'running';
  return (
    <section aria-labelledby="implement-plan" className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[640px] flex-col gap-1">
          <h2 id="implement-plan" className="font-display text-xl font-bold">Make this month’s changes on {audience === 'customer' ? 'your' : 'the'} website</h2>
          <p className="text-[14px] text-ink-2">
            We take the plan’s tasks one by one in order, prepare each task’s exact changes, make them on the website one at a time, check each one on the live page, and undo the whole run if a page breaks. Text that is already right is left alone. Every change can be undone.
          </p>
        </div>
        {!blocker && !busy && (
          <div className="flex flex-wrap items-start gap-2">
            {s.status !== 'paused' || !s.pausedReason?.startsWith('Paused by') ? <StartImplementingButton domain={domain} label={s.items.length ? 'Run again' : 'Start implementing plan'} /> : null}
            {s.status !== 'paused' || !s.pausedReason?.startsWith('Paused by') ? <RunNextTaskButton domain={domain} /> : null}
            <PauseButton domain={domain} paused={s.status === 'paused'} />
          </div>
        )}
      </div>
      {blocker && (
        <p className="rounded-[12px] bg-sunken px-4 py-3 text-sm">
          {blocker} <Link href={connectHref} className="font-semibold text-primary-text underline">Open Connections</Link>
        </p>
      )}
      {busy && <Preparing what={`this month’s changes${s.step ? ` (${s.step.toLowerCase()})` : ''}`} />}
      {s.status === 'paused' && s.pausedReason && (s.pausedReason.startsWith('Paused by')
        ? <p role="status" className="rounded-[12px] bg-sunken px-4 py-3 text-sm font-semibold">{s.pausedReason} No changes go out until someone presses Resume.</p>
        : <p role="alert" className="rounded-[12px] bg-fail-bg px-4 py-3 text-sm font-semibold text-fail-text">Stopped to keep your site safe: {s.pausedReason}</p>)}
      {s.error && <p role="alert" className="rounded-[12px] bg-fail-bg px-4 py-3 text-sm font-semibold text-fail-text">The last run did not finish: {s.error}</p>}
      {last && (
        <p className="text-[13px] text-ink-2">
          Last run {when(last.finishedAt)} UTC{last.by === 'Schedule' ? ' (scheduled)' : ''}: {last.applied} changed ({last.verified} checked on the live page), {last.needsHuman} need a person, {last.failed} failed{last.rolledBack ? ', run undone' : ''}{last.laterCheck ? (last.laterCheck.ok ? '; pages still fine an hour later' : '; undone after the later check') : ''}.
        </p>
      )}
      {!blocker && <AutopilotSchedule domain={domain} state={s} audience={audience} />}
      {actions.length > 0 && <TaskQueue actions={actions} month={month} state={s} busyStep={busy ? s.step : null} />}
      <ExecutionLog state={s} />
      <div className="flex flex-col gap-3">
        <Group title="Changed on the website" list={made.filter((i) => i.status !== 'rolled_back')} domain={domain} undo open />
        <Group title="Needs a person" list={is('needs_human', 'failed')} domain={domain} open />
        {s.settings.mode === 'approve'
          ? <Group title="Waiting for your approval" list={s.items.filter((i) => i.status === 'draft' && !INTERNAL[i.type])} domain={domain} approve open />
          : <Group title="Ready for the next run" list={s.items.filter((i) => i.status === 'draft' && !INTERNAL[i.type])} domain={domain} />}
        <Group title="Already right, left as it is" list={is('keep')} domain={domain} />
        <Group title={audience === 'customer' ? 'For you, our team or a developer' : 'Team, client or developer tasks'} list={is('team', 'client', 'developer')} domain={domain} />
        <Group title="MS SCORE does these itself" list={s.items.filter((i) => INTERNAL[i.type]).map((i) => ({ ...i, reason: i.reason ?? INTERNAL[i.type]! }))} domain={domain} />
        <Group title="Undone" list={made.filter((i) => i.status === 'rolled_back')} domain={domain} />
      </div>
    </section>
  );
}
