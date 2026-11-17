import { actionKey, actionSummary, needsApproval, openActions, type ActionWorkspace, type Suggestion } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { cn, SEVERITY_LABEL, SEVERITY_TONE, TONE_SOFT } from '@/lib/tones';
import { ActionRow } from './ActionRow';
import { AddActions, ApproveButton } from './forms';
import { Roadmap } from './Roadmap';

/** Module 12 page body, shared by the team (/action-plan/<domain>) and customers (/my/actions). */
export function ActionPlanView({ ws, open: suggested, audience, hasAudit }: { ws: ActionWorkspace; open: Suggestion[]; audience: 'team' | 'customer'; hasAudit: boolean }) {
  const domain = ws.domain;
  const sum = actionSummary(ws);
  const top = openActions(ws).slice(0, 10);
  const approvals = ws.actions.filter((a) => needsApproval(a, audience === 'customer' ? 'client' : undefined));
  const shown = ws.actions.filter((a) => a.status !== 'dismissed').sort((a, b) => b.priority - a.priority);
  const dismissed = ws.actions.filter((a) => a.status === 'dismissed');

  if (!ws.actions.length) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-[18px] border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-bold">No actions yet</h2>
        <p className="max-w-2xl text-[15px] text-ink-2">
          {hasAudit
            ? 'Turn the most important findings from your audit and page plan into a to-do list, with a 30/60/90-day roadmap. After each fix, results are checked at 7, 14 and 28 days.'
            : 'Run an audit first: the plan is built from its findings and the page plan.'}
        </p>
        {suggested.length > 0 && <AddActions domain={domain} label={`Create actions from the top ${Math.min(10, suggested.length)} issues`} />}
      </section>
    );
  }

  const stats = [
    { label: 'To do', value: sum.open },
    { label: 'Waiting for approval', value: sum.waitingApproval },
    { label: 'Done', value: sum.done },
    { label: 'Checked and verified', value: sum.verified },
  ];
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[14px] border border-border bg-surface p-4">
            <dt className="text-[13px] text-ink-2">{s.label}</dt>
            <dd className="font-display text-[28px] font-bold tabular">{s.value}</dd>
          </div>
        ))}
      </dl>

      {approvals.length > 0 && (
        <section aria-labelledby="approvals" className="flex flex-col gap-3 rounded-[18px] border border-high-bg bg-surface p-6">
          <h2 id="approvals" className="font-display text-xl font-bold">{audience === 'customer' ? 'Waiting for your approval' : 'Waiting for approval'}</h2>
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Top 10 to do now">
          {top.length ? (
            <ol className="flex list-decimal flex-col gap-2.5 pl-5 text-[15px]">
              {top.map((a) => (
                <li key={a.id} className="pl-1">
                  <span className="font-semibold">{a.title}</span>
                  <span className={cn('ml-2 rounded-pill px-2 py-0.5 text-[11px] font-bold', TONE_SOFT[SEVERITY_TONE[a.severity]])}>{SEVERITY_LABEL[a.severity]}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-2">Everything in the plan is done.</p>
          )}
        </Card>
        <Card title="30/60/90-day roadmap">
          <Roadmap ws={ws} />
        </Card>
      </div>

      <section aria-labelledby="all-actions" className="flex flex-col gap-3">
        <h2 id="all-actions" className="font-display text-xl font-bold">All actions</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-surface">
          {shown.map((a) => (
            <ActionRow key={a.id} domain={domain} action={a} audience={audience} />
          ))}
        </ul>
        {dismissed.length > 0 && (
          <details className="rounded-[18px] border border-border bg-surface">
            <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">Dismissed ({dismissed.length})</summary>
            <ul className="divide-y divide-border">
              {dismissed.map((a) => (
                <ActionRow key={a.id} domain={domain} action={a} audience={audience} />
              ))}
            </ul>
          </details>
        )}
      </section>

      {suggested.length > 0 && (
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
