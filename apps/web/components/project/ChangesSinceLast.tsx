import type { IssueChange, ReportDiff } from '@seo/core';
import { SeverityPill } from '@/components/ui/Pills';
import { cn } from '@/lib/tones';

/** "New issues since last audit" and the rest of the comparison between the two latest completed audits. */
function Group({ title, tone, items, empty, show }: { title: string; tone: string; items: IssueChange[]; empty: string; show: (c: IssueChange) => string | null }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 font-display text-[15px] font-bold">
        <span className={cn('inline-block size-2.5 rounded-full', tone)} aria-hidden="true" />
        {title} <span className="font-normal text-ink-3 tabular">({items.length})</span>
      </h3>
      {items.length ? (
        <ul className="mt-2 divide-y divide-border">
          {items.map((c) => (
            <li key={c.issue.ruleId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
              <SeverityPill severity={c.issue.severity} />
              <span className="min-w-0 flex-1 text-ink">{c.issue.title.client}</span>
              {show(c) && <span className="text-[13px] text-ink-3 tabular">{show(c)}</span>}
              <span className="font-mono text-[11px] text-ink-3">{c.issue.ruleId}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-3">{empty}</p>
      )}
    </section>
  );
}

const count = (n?: number) => (n === undefined ? null : `${n} affected`);

export function ChangesSinceLast({ diff }: { diff: ReportDiff }) {
  const delta = diff.scoreAfter - diff.scoreBefore;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[15px] text-ink-2">
        Score <strong className="text-ink tabular">{diff.scoreBefore}</strong> →{' '}
        <strong className="text-ink tabular">{diff.scoreAfter}</strong>{' '}
        <span className={cn('font-semibold tabular', delta > 0 ? 'text-pass-text' : delta < 0 ? 'text-high-text' : 'text-ink-3')}>
          ({delta > 0 ? '+' : ''}
          {delta})
        </span>
      </p>
      {diff.caveat && <p className="rounded-tile bg-primary-soft px-4 py-3 text-sm text-primary-text">{diff.caveat}</p>}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Group title="New issues" tone="bg-chart-fail" items={diff.added} empty="No new issues." show={(c) => count(c.after)} />
        <Group title="Fixed" tone="bg-chart-pass" items={diff.fixed} empty="Nothing fixed since the last audit." show={() => null} />
        <Group title="Got worse" tone="bg-chart-high" items={diff.worse} empty="Nothing got worse." show={(c) => `${c.before} → ${c.after}`} />
        <Group title="Improved" tone="bg-chart-pass" items={diff.better} empty="No partial improvements." show={(c) => `${c.before} → ${c.after}`} />
      </div>
    </div>
  );
}
