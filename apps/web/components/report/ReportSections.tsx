import type { Audience, CheckCard, ReportModel } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { IssueBadge } from '@/components/ui/Pills';
import { CheckCardView, isCardVisible, worstStatus } from './CheckCardView';
import { CodeBlock } from './CodeBlock';
import { ScoreAfterFixes } from './ScoreAfterFixes';
import { StackedBar } from './StackedBar';
import { StatusRow } from './StatusRow';

export function SectionTitle({ n, title, note }: { n: string; title: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-4 border-b border-border pb-4 pt-6">
      <span className="font-display text-sm font-semibold text-primary tabular">{n}</span>
      <h2 className="font-display text-2xl font-bold tracking-display">{title}</h2>
      {note && <p className="ml-auto hidden text-[13px] text-ink-3 sm:block">{note}</p>}
    </div>
  );
}

function countIssues(rows: ReportModel['robots']['rows']) {
  return rows.filter((r) => r.status === 'fail' || r.status === 'warn').length;
}

export function CrawlFiles({ report, mode }: { report: ReportModel; mode: Audience }) {
  const robotsCard = { id: 'robots', title: '', section: 'technical' as const, rows: report.robots.rows };
  const sitemapCard = { id: 'sitemap', title: '', section: 'technical' as const, rows: report.sitemap.rows };
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title="robots.txt" badge={<IssueBadge count={countIssues(report.robots.rows)} worst={worstStatus(robotsCard)} />}>
        <ul className="mb-5">
          {report.robots.rows.map((r) => (
            <StatusRow key={r.ruleId} row={r} mode={mode} />
          ))}
        </ul>
        <CodeBlock code={report.robots.suggested} label="Suggested robots.txt" />
      </Card>
      <Card title="sitemap.xml" badge={<IssueBadge count={countIssues(report.sitemap.rows)} worst={worstStatus(sitemapCard)} />}>
        <StackedBar segments={report.sitemap.segments} className="mb-5" />
        <ul>
          {report.sitemap.rows.map((r) => (
            <StatusRow key={r.ruleId} row={r} mode={mode} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function CheckGrid({ cards, mode }: { cards: CheckCard[]; mode: Audience }) {
  const visible = cards.filter((c) => isCardVisible(c, mode));
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {visible.map((card) => (
        <CheckCardView key={card.id} card={card} mode={mode} />
      ))}
    </div>
  );
}

export function AfterFixes({ report }: { report: ReportModel }) {
  const gain = report.overall.afterFixes - report.overall.score;
  return (
    <Card title="Score after fixes">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[auto_1fr] md:items-center">
        <ScoreAfterFixes today={report.overall.score} after={report.overall.afterFixes} />
        <div className="max-w-md">
          <p className="font-display text-[40px] font-bold leading-none tracking-display text-pass-text tabular">+{gain}</p>
          <p className="mt-3 text-[15px] leading-7 text-ink-2">
            Fixing the {report.severityCounts.critical} critical and {report.severityCounts.high} high-priority issues
            moves {report.project.domain} from <strong className="text-ink">{report.overall.label.toLowerCase()}</strong> to
            a score of <strong className="text-ink tabular">{report.overall.afterFixes}</strong>. Most of these are
            settings and template changes, not new content.
          </p>
        </div>
      </div>
    </Card>
  );
}
