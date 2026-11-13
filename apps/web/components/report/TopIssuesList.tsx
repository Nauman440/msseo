import { CATEGORY_LABEL, icePriority, type Audience, type TopIssue } from '@seo/core';
import { SeverityPill } from '@/components/ui/Pills';

export function TopIssuesList({ issues, mode }: { issues: TopIssue[]; mode: Audience }) {
  return (
    <ol className="divide-y divide-border">
      {issues.map((issue, i) => (
        <li key={issue.ruleId} className="grid break-inside-avoid grid-cols-[28px_1fr] gap-x-4 py-4 print:py-3 first:pt-0 last:pb-0 sm:grid-cols-[28px_1fr_auto]">
          <span className="font-display text-sm font-semibold text-ink-3 tabular">{String(i + 1).padStart(2, '0')}</span>
          <div className="min-w-0">
            {/* Inline flow (not flex-wrap) so a long title wraps beside the pill instead of dropping below it. */}
            <h4 className="text-[15px] font-semibold leading-6">
              <span className="mr-2 inline-block align-[1px]">
                <SeverityPill severity={issue.severity} />
              </span>
              {mode === 'expert' && <span className="mr-2 font-mono text-xs font-normal text-ink-3">{issue.ruleId}</span>}
              {issue.title[mode]}
            </h4>
            <p className="mt-1 text-sm leading-6 text-ink-2">{issue.sub[mode]}</p>
          </div>
          <div className="col-start-2 mt-2 flex items-center gap-3 text-xs text-ink-3 sm:col-start-auto sm:mt-0 sm:flex-col sm:items-end sm:gap-1">
            <span className="font-medium">{CATEGORY_LABEL[issue.category]}</span>
            {mode === 'expert' && (
              <span className="tabular">
                ICE {issue.ice.impact}·{issue.ice.confidence}·{issue.ice.effort} ={' '}
                <strong className="text-ink">{icePriority(issue.ice)}</strong>
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
