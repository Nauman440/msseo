import { PLAN_FILES, planStillWriting, type ActionWorkspace, type StoredAiPlan } from '@seo/core';
import { PlanWriting } from './PlanWriting';
import { RegeneratePlanButton, RewritePlanButton } from './forms';

/**
 * The top of the action plan when it was written by AI: what the 6 months should achieve, the numbers
 * to beat, the theme of each month and what was left for later. The team also sees the page map, the
 * keywords the plan dropped, missing data and what the checks changed in the AI's answer.
 */
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';
const FOLD = 'rounded-[14px] border border-border';
const SUMMARY = 'cursor-pointer px-4 py-3 text-sm font-semibold';
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

export type AiPlanState = {
  available: boolean;
  disabledReason: string | null;
  preparing: boolean;
  /** Temporary "Regenerate plan" button (Settings switch). */
  regenerate?: boolean;
  /** Background writer: current step, or why the last try failed. */
  status?: ActionWorkspace['aiPlanStatus'];
};

/** Writing now (and not stalled), or the last try failed. */
function StatusLine({ status }: { status: AiPlanState['status'] }) {
  if (!status) return null;
  if (planStillWriting(status)) return <PlanWriting step={status.step} startedAt={status.startedAt} />;
  if (status.state === 'failed') return <p role="alert" className="rounded-[14px] border border-fail-bg bg-fail-bg px-[18px] py-3.5 text-sm text-fail-text"><b>The plan could not be written.</b> {status.message ?? ''}</p>;
  return null;
}

/** RULES 1–10: the checks the plan passed, and the plan's files to download. */
function ChecksAndFiles({ domain, plan, team }: { domain: string; plan: StoredAiPlan; team: boolean }) {
  const v = plan.validation ?? [];
  const passed = v.filter((x) => x.pass).length;
  return (
    <div className="flex flex-col gap-2">
      {v.length > 0 && (
        <details className={FOLD} open={team && passed < v.length}>
          <summary className={SUMMARY}>Plan checks: {passed} of {v.length} pass</summary>
          <ul className="flex flex-col gap-1.5 px-4 pb-4 text-sm">
            {v.map((x) => (
              <li key={x.check} className="flex gap-2">
                <span className={`shrink-0 rounded-[6px] px-1.5 text-[11.5px] font-bold ${x.pass ? 'bg-pass-bg text-pass-text' : 'bg-fail-bg text-fail-text'}`}>{x.pass ? 'PASS' : 'FAIL'}</span>
                <span><span className="font-semibold">{x.check}</span> <span className="text-ink-2">· {x.detail}</span></span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className={FOLD}>
        <summary className={SUMMARY}>Download the plan and its working files</summary>
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          <a href={`/api/action-plan/${domain}/files?file=all`} download className="inline-flex min-h-11 items-center rounded-button bg-primary px-4 text-sm font-bold text-primary-ink hover:bg-primary-hover">All files (.zip)</a>
          {PLAN_FILES.map((f) => (
            <a key={f} href={`/api/action-plan/${domain}/files?file=${f}`} download className="inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-3 font-mono text-[13px] hover:border-ink-3">{f}</a>
          ))}
        </div>
      </details>
    </div>
  );
}

export function AiPlanOverview({ domain, plan, audience, ai }: { domain: string; plan: StoredAiPlan | null | undefined; audience: 'team' | 'customer'; ai: AiPlanState }) {
  const regenerate = ai.regenerate ? (
    <div className="flex flex-col items-start gap-1.5 rounded-[14px] border border-dashed border-border-strong bg-surface p-4">
      <p className="text-[13px] text-ink-2">Start over: a new plan from today’s audit, keywords and Google data.</p>
      <RegeneratePlanButton domain={domain} />
    </div>
  ) : null;
  const status = <StatusLine status={ai.status} />;
  const writing = planStillWriting(ai.status);
  if (!plan) {
    if (writing || ai.status?.state === 'failed') return <div className="flex flex-col gap-3">{status}{!writing && regenerate}</div>;
    if (regenerate && !ai.preparing) return regenerate;
    if (!ai.available || ai.preparing) return null;
    return (
      <section className="flex flex-col items-start gap-3 rounded-[18px] border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-bold">Get a 6-month plan written for this website</h2>
        <p className="max-w-2xl text-[15px] text-ink-2">We read the audit, your keywords, the page plan and your Google data, and put the work in the right order: fixes that stop Google first, quick wins next, then new pages and articles.</p>
        <RewritePlanButton domain={domain} label="Write the 6-month plan" disabledReason={ai.disabledReason} />
      </section>
    );
  }
  const team = audience === 'team';
  return (
    <section aria-labelledby="ai-plan" className="flex flex-col gap-5 rounded-[18px] border border-border bg-surface p-6">
      {status}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 max-w-[760px] flex-col gap-1.5">
          <p className={EYEBROW}>Your 6-month plan · written {date(plan.generatedAt)}</p>
          <h2 id="ai-plan" className="font-display text-[22px] font-bold">What the next 6 months should achieve</h2>
          <p className="text-[15px] leading-relaxed text-ink-2">{plan.summary}</p>
        </div>
        {!writing && (ai.regenerate ? <RegeneratePlanButton domain={domain} /> : ai.available && <RewritePlanButton domain={domain} label="Rewrite the plan" disabledReason={ai.disabledReason} />)}
      </div>

      {plan.baseline_and_targets.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="sr-only">Where you are now and the targets</caption>
            <thead>
              <tr className="text-[12px] text-ink-2">
                <th className="py-2 pr-3 font-semibold">What we measure</th>
                <th className="py-2 pr-3 font-semibold">Now</th>
                <th className="py-2 pr-3 font-semibold">In 3 months</th>
                <th className="py-2 font-semibold">In 6 months</th>
              </tr>
            </thead>
            <tbody>
              {plan.baseline_and_targets.map((r) => (
                <tr key={r.metric} className="border-t border-border">
                  <td className="py-2 pr-3 font-semibold">{r.metric}</td>
                  <td className="py-2 pr-3 tabular">{r.now}</td>
                  <td className="py-2 pr-3 tabular">{r.month_3_target}</td>
                  <td className="py-2 font-semibold tabular text-pass-text">{r.month_6_target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Month themes and goals head each month's to-dos under "Your 6-month plan". */}

      {/* Plan checks, downloads, "later" and "needs a developer" are working notes for the team only. */}
      {team && <ChecksAndFiles domain={domain} plan={plan} team={team} />}

      <div className="flex flex-col gap-2">
        {team && plan.later.length > 0 && (
          <details className={FOLD}>
            <summary className={SUMMARY}>Planned for later ({plan.later.length})</summary>
            <ul className="flex flex-col gap-1.5 px-4 pb-4 text-sm">
              {plan.later.map((l, i) => (
                <li key={i}><span className="font-semibold">{l.title}</span> <span className="text-ink-2">· {l.reason_deferred}</span></li>
              ))}
            </ul>
          </details>
        )}
        {team && (plan.needsDeveloper ?? []).length > 0 && (
          <details className={FOLD}>
            <summary className={SUMMARY}>Needs a developer: left out of the plan ({plan.needsDeveloper!.length})</summary>
            <ul className="flex flex-col gap-1.5 px-4 pb-4 text-sm">
              {plan.needsDeveloper!.map((n, i) => (
                <li key={i}><span className="font-semibold">{n.issue}</span> <span className="text-ink-2">· {n.reason}</span></li>
              ))}
            </ul>
          </details>
        )}
        {team && plan.page_map.length > 0 && (
          <details className={FOLD}>
            <summary className={SUMMARY}>Page map: one main keyword per page ({plan.page_map.length})</summary>
            <ul className="flex flex-col gap-2 px-4 pb-4 text-sm">
              {plan.page_map.map((p) => (
                <li key={p.url} className="[overflow-wrap:anywhere]">
                  <span className="font-mono text-[12.5px]">{path(p.url)}</span>
                  {p.is_new && <span className="ml-1.5 rounded-pill bg-primary-chip px-1.5 text-[11px] font-bold text-primary-heading">new</span>}
                  <span className="text-ink-2"> · {p.page_type} · </span>
                  <span className="font-semibold">{p.main_keyword}</span>
                  {p.supporting_keywords.length > 0 && <span className="text-ink-2"> + {p.supporting_keywords.join(', ')}</span>}
                  <span className="text-ink-2 tabular"> · {p.total_monthly_volume.toLocaleString('en-US')}/mo</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {team && plan.removed_keywords.length > 0 && (
          <details className={FOLD}>
            <summary className={SUMMARY}>Keywords the plan left out ({plan.removed_keywords.length})</summary>
            <ul className="flex flex-col gap-1 px-4 pb-4 text-sm">
              {plan.removed_keywords.map((k) => (
                <li key={k.keyword}><span className="font-semibold">{k.keyword}</span> <span className="text-ink-2">· {k.reason}</span></li>
              ))}
            </ul>
          </details>
        )}
        {team && (plan.data_gaps.length > 0 || plan.notes.length > 0) && (
          <details className={FOLD}>
            <summary className={SUMMARY}>Missing data and plan checks ({plan.data_gaps.length + plan.notes.length})</summary>
            <ul className="flex list-disc flex-col gap-1 py-1 pb-4 pl-9 pr-4 text-sm text-ink-2">
              {plan.data_gaps.map((g, i) => <li key={`g${i}`}>{g}</li>)}
              {plan.notes.map((n, i) => <li key={`n${i}`}>Check: {n}</li>)}
            </ul>
            <p className="px-4 pb-4 text-[12.5px] text-ink-3 tabular">{plan.model} · {plan.tokens.toLocaleString('en-US')} tokens · capacity {plan.capacity.automatic} automatic changes, {plan.capacity.newPages} new pages, {plan.capacity.articles} articles a month ({plan.tier})</p>
          </details>
        )}
      </div>
    </section>
  );
}
