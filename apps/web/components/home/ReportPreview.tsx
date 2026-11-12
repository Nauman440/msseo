import Link from 'next/link';
import type { ReportModel } from '@seo/core';
import { ScoreGauge } from '@/components/report/ScoreGauge';
import { CategoryBars } from '@/components/report/CategoryBars';
import { SeverityPill } from '@/components/ui/Pills';

/** A live render of the sample report, used as the hero "product shot". */
export function ReportPreview({ report }: { report: ReportModel }) {
  return (
    <div className="relative">
      <div className="rounded-[22px] border border-white/10 bg-night-2/80 p-5 shadow-lift backdrop-blur sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-night-line pb-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{report.project.domain}</p>
            <p className="text-xs text-white/45 tabular">
              {report.pagesCrawled} pages audited · mobile field data
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
            <span className="size-1.5 rounded-full bg-brand" /> Completed
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 pt-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <ScoreGauge score={report.overall.score} label={report.overall.label} size={148} dark />
          <CategoryBars categories={report.categories.slice(0, 5)} dark />
        </div>
      </div>

      <div className="relative z-10 mx-4 -mt-5 rounded-card border border-border bg-surface p-4 shadow-lift sm:mx-8">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Fix first</p>
        <ul className="space-y-2.5">
          {report.topIssues.slice(0, 2).map((issue) => (
            <li key={issue.ruleId} className="flex items-center gap-2.5">
              <SeverityPill severity={issue.severity} />
              <span className="truncate text-sm font-medium">{issue.title.client}</span>
            </li>
          ))}
        </ul>
        <Link
          href="/audits/demo"
          className="mt-3 inline-flex text-[13px] font-semibold text-primary-text hover:underline"
        >
          Open full report →
        </Link>
      </div>
    </div>
  );
}
