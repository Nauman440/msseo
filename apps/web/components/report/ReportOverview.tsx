import { TOP_ISSUES_LIMIT, type Audience, type ReportModel } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { CategoryBars } from './CategoryBars';
import { CwvTile } from './CwvTile';
import { ScoreGauge } from './ScoreGauge';
import { SeverityDonut } from './SeverityDonut';
import { StackedBar } from './StackedBar';
import { TopIssuesList } from './TopIssuesList';
import { TonePill } from '@/components/ui/Pills';

/** §9.3 rows 4–6: health / categories / severity, page health + CWV, top issues. */
export function ReportOverview({ report, mode }: { report: ReportModel; mode: Audience }) {
  const { healthy, warnings, errors } = report.pageHealth;
  const total = healthy + warnings + errors;

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Overall SEO health">
          <div className="flex flex-col items-center pt-1">
            <ScoreGauge score={report.overall.score} label={report.overall.label} />
            <p className="mt-4 text-center text-[13px] text-ink-2">
              Fixing critical and high issues lifts this to{' '}
              <strong className="font-semibold text-pass-text tabular">{report.overall.afterFixes}</strong>
            </p>
          </div>
        </Card>
        <Card title="Score by category">
          <CategoryBars categories={report.categories} />
        </Card>
        <Card title="Issues by severity">
          <SeverityDonut counts={report.severityCounts} />
        </Card>
      </div>

      <div className={report.cwv && total > 0 ? 'grid grid-cols-1 gap-6 lg:grid-cols-2' : 'grid grid-cols-1 gap-6'}>
        {total > 0 && (
          <Card title="Page health" badge={<span className="text-[13px] text-ink-3 tabular">{total} pages</span>}>
            <p className="mb-5 font-display text-[40px] font-bold leading-none tracking-display tabular">
              {Math.round((healthy / Math.max(1, total)) * 100)}%
              <span className="ml-2 text-sm font-medium tracking-normal text-ink-3">healthy</span>
            </p>
            <StackedBar
              segments={[
                { label: 'Healthy', value: healthy, tone: 'pass' },
                { label: 'Warnings', value: warnings, tone: 'warn' },
                { label: 'Errors', value: errors, tone: 'fail' },
              ]}
            />
          </Card>
        )}
        {report.cwv && (
          <Card
            title="Core Web Vitals"
            eyebrow="Mobile · homepage"
            badge={<TonePill tone={report.cwv.source === 'field' ? 'primary' : 'info'}>{report.cwv.source === 'field' ? 'Field data' : 'Lab data'}</TonePill>}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {report.cwv.metrics.map((m) => (
                <CwvTile key={m.id} metric={m} />
              ))}
            </div>
          </Card>
        )}
      </div>

      <Card title="Top issues to fix first" eyebrow={mode === 'expert' ? 'Sorted by ICE priority' : 'Biggest impact first'}>
        <TopIssuesList issues={report.topIssues.slice(0, TOP_ISSUES_LIMIT[mode])} mode={mode} />
      </Card>
    </>
  );
}
