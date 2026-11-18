import { canApply, type ActionItem } from '@seo/core';
import { ApplyButton, UndoButton } from '@/components/connections/forms';
import type { ConnectionView } from '@/lib/connections';
import { cn, SEVERITY_LABEL, SEVERITY_TONE, TONE_SOFT } from '@/lib/tones';
import { ActionEditor, ActionStatusSelect, ApproveButton } from './forms';
import { ACTION_STATUS_LABEL, ACTION_STATUS_TONE, APPROVAL_LABEL, BUCKET_LABEL, VERDICT_LABEL, VERDICT_TONE } from './labels';

const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const Chip = ({ tone, children }: { tone: keyof typeof TONE_SOFT; children: React.ReactNode }) => (
  <span className={cn('rounded-pill px-2 py-0.5 text-[12px] font-bold', TONE_SOFT[tone])}>{children}</span>
);

/** One action: summary line, then details (12.4 fields, 12.5 before-state, 12.6 checks). */
export function ActionRow({ domain, action: a, audience, site = null, connectHref }: { domain: string; action: ActionItem; audience: 'team' | 'customer'; site?: ConnectionView | null; connectHref?: string }) {
  const waiting = a.approval !== 'none' && !a.approvedAt;
  const canApprove = waiting && (audience === 'team' || a.approval === 'client');
  const b = a.before;
  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className={cn('font-semibold leading-snug', a.status === 'dismissed' && 'text-ink-3 line-through')}>{a.title}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">
            <Chip tone={SEVERITY_TONE[a.severity]}>{SEVERITY_LABEL[a.severity]}</Chip>
            <Chip tone={ACTION_STATUS_TONE[a.status]}>{ACTION_STATUS_LABEL[a.status]}</Chip>
            <span>{BUCKET_LABEL[a.bucket]}</span>
            {a.dueDate && <span>· due {date(a.dueDate)}</span>}
            {a.owner && <span>· {a.owner}</span>}
            {audience === 'team' && <span className="tabular">· priority {a.priority} (I{a.impact} × C{a.confidence} ÷ E{a.effort})</span>}
            {waiting && <Chip tone="high">{APPROVAL_LABEL[a.approval]}: waiting</Chip>}
            {a.approvedAt && <span>· approved by {a.approvedBy}</span>}
          </div>
        </div>
        <ActionStatusSelect domain={domain} action={a} />
      </div>
      {a.changes && a.changes.length > 0 && (
        <ul aria-label="Changes to approve" className="flex flex-col gap-2">
          {a.changes.map((c) => (
            <li key={c.id} className="relative grid grid-cols-1 gap-2 rounded-[12px] border border-border p-3 text-[13px] sm:grid-cols-[140px_1fr_1fr]">
              <span className="font-bold">{c.label}</span>
              <span className="whitespace-pre-line text-ink-2 [overflow-wrap:anywhere]"><span className="sr-only">Now: </span>{c.now}</span>
              <span className="whitespace-pre-line font-semibold text-teal-text [overflow-wrap:anywhere]"><span className="sr-only">New: </span>→ {c.suggested}</span>
            </li>
          ))}
        </ul>
      )}
      <SiteApply domain={domain} a={a} site={site} connectHref={connectHref} waiting={waiting} />
      {canApprove && <ApproveButton domain={domain} id={a.id} label={audience === 'team' && a.approval === 'client' ? 'Record client approval' : 'Approve'} />}
      <details className="group">
        <summary className="cursor-pointer text-[13px] font-semibold text-primary-text">Details</summary>
        <div className="mt-3 flex flex-col gap-4 text-[14px]">
          <p className="text-ink-2">{a.detail}</p>
          {a.urls.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {a.urls.slice(0, 12).map((u) => (
                <li key={u} className="rounded-[6px] bg-sunken px-2 py-0.5 font-mono text-[12px] text-ink-2 [overflow-wrap:anywhere]">{path(u)}</li>
              ))}
              {a.urls.length > 12 && <li className="text-[12px] text-ink-3">+{a.urls.length - 12} more</li>}
            </ul>
          )}
          {b && (
            <div className="rounded-[12px] border border-border p-3">
              <p className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink-3">Before ({date(b.capturedAt)})</p>
              <p className="mt-1 text-ink-2">
                {[
                  b.score !== null ? `SEO health ${b.score}` : null,
                  b.affected !== null ? `${b.affected}${b.applicable ? ` of ${b.applicable}` : ''} affected` : null,
                  b.gsc ? `${b.gsc.clicks.toLocaleString('en-GB')} clicks, ${b.gsc.impressions.toLocaleString('en-GB')} times seen in Google (3 months)` : null,
                ].filter(Boolean).join(' · ') || 'Saved.'}
              </p>
              {b.pages.slice(0, 3).map((p) => (
                <p key={p.url} className="mt-1 text-[12px] text-ink-3 [overflow-wrap:anywhere]">
                  {path(p.url)}: “{p.title ?? 'no title'}”
                </p>
              ))}
            </div>
          )}
          {a.checkpoints.length > 0 && (
            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {a.checkpoints.map((c) => (
                <li key={c.day} className="rounded-[12px] border border-border p-3">
                  <p className="flex items-center justify-between gap-2 font-semibold">
                    Day {c.day}
                    {c.result ? <Chip tone={VERDICT_TONE[c.result.verdict]}>{VERDICT_LABEL[c.result.verdict]}</Chip> : <span className="text-[12px] text-ink-3">{date(c.dueAt)}</span>}
                  </p>
                  {c.result && <p className="mt-1 text-[12px] text-ink-2">{c.result.note}</p>}
                </li>
              ))}
            </ol>
          )}
          {audience === 'team' && <ActionEditor domain={domain} action={a} />}
        </div>
      </details>
    </li>
  );
}

const RESULT_TONE: Record<string, keyof typeof TONE_SOFT> = { applied: 'pass', manual: 'info', failed: 'fail', undone: 'info' };
const RESULT_LABEL: Record<string, string> = { applied: 'Applied', manual: 'By hand', failed: 'Failed', undone: 'Undone' };

/** Spec §16.5: apply the approved changes to the connected site, see what happened, undo. */
function SiteApply({ domain, a, site, connectHref, waiting }: { domain: string; a: ActionItem; site: ConnectionView | null; connectHref?: string; waiting: boolean }) {
  const auto = (a.changes ?? []).filter(canApply).length;
  if (!a.changes?.length) return null;
  const live = a.applied && !a.applied.undoneAt;
  // WordPress needs our plugin for titles, descriptions and redirects.
  const needsPlugin = site?.platform === 'wordpress' && !site.plugin;
  return (
    <div className="flex flex-col gap-2">
      {a.applied && (
        <ul aria-label="Applied to the website" className="flex flex-col gap-1.5">
          {a.applied.results.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-2 text-[13px]">
              <Chip tone={RESULT_TONE[r.status] ?? 'info'}>{RESULT_LABEL[r.status] ?? r.status}</Chip>
              <span className="font-semibold">{r.label}</span>
              <span className="min-w-0 flex-1 text-ink-2 [overflow-wrap:anywhere]">{r.note}</span>
            </li>
          ))}
          <li className="text-[12px] text-ink-3">{a.applied.undoneAt ? `Undone on ${date(a.applied.undoneAt)}` : `Applied on ${date(a.applied.at)} by ${a.applied.by}`}</li>
        </ul>
      )}
      {live && a.applied!.results.some((r) => r.status === 'applied') && <UndoButton domain={domain} id={a.id} />}
      {!live && auto > 0 && site && needsPlugin && <p className="text-[13px] text-ink-2">Install the MS SCORE Connector plugin on the website to apply these changes (see Website connection).</p>}
      {!live && auto > 0 && site && site.status === 'ok' && !needsPlugin && !waiting && <ApplyButton domain={domain} id={a.id} count={auto} />}
      {!live && auto > 0 && site && site.status === 'ok' && !needsPlugin && waiting && <p className="text-[13px] text-ink-2">Approve first, then it can be applied to the website.</p>}
      {!live && auto > 0 && !site && connectHref && (
        <p className="text-[13px] text-ink-2">
          <a href={connectHref} className="font-semibold text-primary-text underline">Connect the website</a> to apply {auto === 1 ? 'this change' : `these ${auto} changes`} for you.
        </p>
      )}
    </div>
  );
}
