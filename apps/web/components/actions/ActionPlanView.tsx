import { ACTION_BUCKETS, actionKey, actionSummary, needsApproval, openActions, type ActionItem, type ActionWorkspace, type Suggestion } from '@seo/core';
import { Card } from '@/components/ui/Card';
import type { ConnectionView } from '@/lib/connections';
import { cn, SEVERITY_LABEL, SEVERITY_TONE, TONE_SOFT } from '@/lib/tones';
import { ActionRow } from './ActionRow';
import { AiPlanOverview, type AiPlanState } from './AiPlanOverview';
import { AddActions, ApproveButton } from './forms';
import { Roadmap } from './Roadmap';

/** Module 12 page body, shared by the team (/action-plan/<domain>) and customers (/my/actions). */
export function ActionPlanView({ ws, open: suggested, audience, hasAudit, site = null, connectHref, ai = { available: false, disabledReason: null, preparing: false } }: {
  ws: ActionWorkspace;
  open: Suggestion[];
  audience: 'team' | 'customer';
  hasAudit: boolean;
  /** Spec §16.5: the connected WordPress or Shopify site, and where to connect one. */
  site?: ConnectionView | null;
  connectHref?: string;
  /** The AI-written plan: whether it can be written here, and whether it is being written now. */
  ai?: AiPlanState;
}) {
  const domain = ws.domain;
  const sum = actionSummary(ws);
  const top = openActions(ws).slice(0, 10);
  const approvals = ws.actions.filter((a) => needsApproval(a, audience === 'customer' ? 'client' : undefined));
  const shown = ws.actions.filter((a) => a.status !== 'dismissed');
  const dismissed = ws.actions.filter((a) => a.status === 'dismissed');
  // Each to-do sits in its plan month (AI plan), else in its roadmap month.
  const monthOf = (a: ActionItem) => a.plan?.month ?? Math.max(1, ACTION_BUCKETS.indexOf(a.bucket) + 1);
  const themes = new Map((ws.aiPlan?.months ?? []).map((m) => [m.month, m]));
  const months = [1, 2, 3, 4, 5, 6]
    .map((month) => {
      const list = shown.filter((a) => monthOf(a) === month).sort((a, b) => (a.plan?.week ?? 0) - (b.plan?.week ?? 0) || b.priority - a.priority);
      return { month, theme: themes.get(month)?.theme ?? '', goal: themes.get(month)?.goal ?? '', list, done: list.filter((a) => a.status === 'done' || a.status === 'verified').length };
    })
    .filter((m) => m.list.length || m.theme);

  // With an AI plan, it decides what is in the plan; the leftover findings list is for the team only.
  const showSuggested = suggested.length > 0 && (!ws.aiPlan || audience === 'team');
  const overview = <AiPlanOverview domain={domain} plan={ws.aiPlan} audience={audience} ai={ai} />;

  if (!ws.actions.length) {
    if (ws.aiPlan || ai.available) return overview;
    return (
      <section className="flex flex-col items-start gap-3 rounded-[18px] border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-bold">No actions yet</h2>
        <p className="max-w-2xl text-[15px] text-ink-2">
          {hasAudit
            ? 'Turn the most important findings from your audit and page plan into a to-do list, with a 6-month roadmap. After each fix, results are checked at 7, 14 and 28 days.'
            : 'Run an audit first: the plan is built from its findings and the page plan.'}
        </p>
        {suggested.length > 0 && <AddActions domain={domain} label={`Create actions from the top ${Math.min(10, suggested.length)} issues`} />}
      </section>
    );
  }

  // Customers see what is to do and done; the approval count and the "Top 10" list are for the team.
  const stats = [
    { label: 'To do', value: sum.open },
    ...(audience === 'team' ? [{ label: 'Waiting for approval', value: sum.waitingApproval }] : []),
    { label: 'Done', value: sum.done },
    { label: 'Checked and verified', value: sum.verified },
  ];
  return (
    <div className="flex flex-col gap-6">
      {overview}
      <dl className={cn('grid grid-cols-2 gap-3', stats.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
        {stats.map((s) => (
          <div key={s.label} className="rounded-[14px] border border-border bg-surface p-4">
            <dt className="text-[13px] text-ink-2">{s.label}</dt>
            <dd className="font-display text-[28px] font-bold tabular">{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* Customers approve each to-do in its month below (and under Approvals in the sidebar). */}
      {audience === 'team' && approvals.length > 0 && (
        <section aria-labelledby="approvals" className="flex flex-col gap-3 rounded-[18px] border border-high-bg bg-surface p-6">
          <h2 id="approvals" className="font-display text-xl font-bold">Waiting for approval</h2>
          <ul className="flex flex-col gap-4">
            {approvals.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 border-b border-border pb-4 last:border-0 last:pb-0">
                <p className="font-semibold">{a.title}</p>
                <p className="text-sm text-ink-2">{a.detail}</p>
                {(audience === 'team' || a.approval === 'client') && <ApproveButton domain={domain} id={a.id} label={audience === 'team' && a.approval === 'client' ? 'Record client approval' : 'Approve'} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {audience === 'team' && <Card title="Top 10 to do now">
        {top.length ? (
          <ol className="grid grid-cols-1 gap-x-8 gap-y-1 lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-5">
            {top.map((a, i) => (
              <li key={a.id} className="flex items-start gap-3 border-b border-border py-2.5 text-[15px] last:border-0 lg:[&:nth-child(5)]:border-0">
                <span className="w-6 shrink-0 text-right font-bold tabular text-ink-3">{i + 1}.</span>
                <span className="min-w-0 flex-1 font-semibold leading-snug">{a.title}</span>
                <span className={cn('shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-bold', TONE_SOFT[SEVERITY_TONE[a.severity]])}>{SEVERITY_LABEL[a.severity]}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-2">Everything in the plan is done.</p>
        )}
      </Card>}
      <Card title="6-month roadmap">
        <Roadmap ws={ws} columns={3} />
      </Card>

      <section aria-labelledby="six-months" className="flex flex-col gap-3">
        <h2 id="six-months" className="font-display text-xl font-bold">Your 6-month plan</h2>
        {/* The to-dos month by month (week order, then priority); Month 1 starts open. */}
        {months.map((m) => (
          <details key={m.month} open={m.month === 1} className="group rounded-[18px] border border-border bg-surface">
            <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-4">
              <span className="text-[12px] font-bold uppercase tracking-wide text-primary-text">Month {m.month}</span>
              <span className="font-semibold">{m.theme || `${m.list.length} ${m.list.length === 1 ? 'to-do' : 'to-dos'}`}</span>
              <span className="text-[13px] text-ink-2 tabular">{m.done} of {m.list.length} done</span>
            </summary>
            {m.goal && <p className="px-5 pb-3 text-[14px] text-ink-2">{m.goal}</p>}
            {m.list.length > 0 ? (
              <ul aria-label={`Month ${m.month} to-dos`} className="divide-y divide-border border-t border-border">
                {m.list.map((a) => (
                  <ActionRow key={a.id} domain={domain} action={a} audience={audience} site={site} connectHref={connectHref} />
                ))}
              </ul>
            ) : (
              <p className="border-t border-border px-5 py-3 text-sm text-ink-2">Nothing planned for this month yet.</p>
            )}
          </details>
        ))}
        {dismissed.length > 0 && (
          <details className="rounded-[18px] border border-border bg-surface">
            <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">Dismissed ({dismissed.length})</summary>
            <ul className="divide-y divide-border">
              {dismissed.map((a) => (
                <ActionRow key={a.id} domain={domain} action={a} audience={audience} site={site} connectHref={connectHref} />
              ))}
            </ul>
          </details>
        )}
      </section>

      {showSuggested && (
        <section aria-labelledby="suggested" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="suggested" className="font-display text-xl font-bold">Findings not in the plan yet</h2>
              <p className="mt-1 text-sm text-ink-2">From the latest audit and the page plan, most important first.</p>
            </div>
            <AddActions domain={domain} label={`Add the top ${Math.min(10, suggested.length)}`} tone="secondary" />
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-surface">
            {suggested.slice(0, 30).map((s) => (
              <li key={actionKey(s.source)} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="font-semibold leading-snug">{s.title}</p>
                  <p className="text-[12px] text-ink-2">
                    <span className={cn('mr-1.5 rounded-pill px-2 py-0.5 font-bold', TONE_SOFT[SEVERITY_TONE[s.severity]])}>{SEVERITY_LABEL[s.severity]}</span>
                    {s.source.kind === 'mapping' ? 'Page plan' : 'Audit'}
                    {audience === 'team' && <span className="tabular"> · priority {s.priority}</span>}
                  </p>
                </div>
                <AddActions domain={domain} suggestionKey={actionKey(s.source)} label="Add" tone="secondary" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
