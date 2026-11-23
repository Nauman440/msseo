import { ACTION_BUCKETS, type ActionItem, type ActionWorkspace } from '@seo/core';
import { CARD } from '@/components/backlinks/Sections';
import { cn } from '@/lib/tones';
import { ACTION_STATUS_LABEL, APPROVAL_LABEL, BUCKET_LABEL } from './labels';
import { Roadmap } from './Roadmap';

/**
 * The whole six-month action plan as a printable document (PDF download): the drawn roadmap, then every
 * action month by month with its status, priority, due date and who approves it. No md:/lg: classes.
 */
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const SEVERITY: Record<ActionItem['severity'], string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

export function ActionPlanPrint({ ws }: { ws: ActionWorkspace }) {
  const live = ws.actions.filter((a) => a.status !== 'dismissed');
  const done = live.filter((a) => a.status === 'done' || a.status === 'verified').length;
  return (
    <article className="flex flex-col gap-[22px]">
      <div>
        <p className="text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-primary-heading">Action plan</p>
        <h1 className="font-display text-3xl font-extrabold">Your 6-month SEO plan</h1>
        <p className="text-ink-2">
          {ws.domain} · {live.length} actions · {done} done
        </p>
      </div>
      {!live.length ? (
        <p className="rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm text-ink-2">The plan is empty: it fills in after the first audit.</p>
      ) : (
        <>
          <section aria-labelledby="p-roadmap" className={cn(CARD, 'pdf-avoid')}>
            <h2 id="p-roadmap" className="font-display text-xl font-bold">Roadmap</h2>
            <Roadmap ws={ws} max={4} />
          </section>
          {ACTION_BUCKETS.map((b) => {
            const items = live.filter((a) => a.bucket === b).sort((x, y) => y.priority - x.priority);
            if (!items.length) return null;
            return (
              <section key={b} aria-labelledby={`p-${b}`} className={CARD}>
                <h2 id={`p-${b}`} className="font-display text-xl font-bold">
                  {BUCKET_LABEL[b]} <span className="text-base font-semibold text-ink-2">· {items.length} actions</span>
                </h2>
                <ol className="flex flex-col">
                  {items.map((a, i) => (
                    <li key={a.id} className="pdf-avoid flex gap-3 border-t border-border py-3 text-sm first:border-t-0">
                      <span className="w-6 shrink-0 font-bold tabular text-ink-3">{i + 1}.</span>
                      <span className="min-w-0 flex-1">
                        <b className="block">{a.title}</b>
                        {a.detail && <span className="block text-ink-2">{a.detail}</span>}
                        <span className="mt-1 block text-[12px] text-ink-3">
                          {ACTION_STATUS_LABEL[a.status]} · {SEVERITY[a.severity]} · priority {Math.round(a.priority * 10) / 10}
                          {a.dueDate ? ` · due ${day(a.dueDate)}` : ''} · {APPROVAL_LABEL[a.approval]}
                          {a.owner ? ` · ${a.owner}` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </>
      )}
    </article>
  );
}
