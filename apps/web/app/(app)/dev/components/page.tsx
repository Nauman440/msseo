import { notFound } from 'next/navigation';
import { sampleReport as r } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { IssueBadge, SeverityPill, StatusPill } from '@/components/ui/Pills';
import { StatTile } from '@/components/ui/StatTile';
import { Banner } from '@/components/report/Banner';
import { CategoryBars } from '@/components/report/CategoryBars';
import { CodeBlock } from '@/components/report/CodeBlock';
import { CwvTile } from '@/components/report/CwvTile';
import { HBarList } from '@/components/report/HBarList';
import { ScoreAfterFixes } from '@/components/report/ScoreAfterFixes';
import { ScoreGauge } from '@/components/report/ScoreGauge';
import { SeverityDonut } from '@/components/report/SeverityDonut';
import { StackedBar } from '@/components/report/StackedBar';
import { StatusRow } from '@/components/report/StatusRow';
import { TopIssuesList } from '@/components/report/TopIssuesList';

/** Rendered per request so SHOW_DEV_PAGES can be toggled on staging without a rebuild. */
export const dynamic = 'force-dynamic';

/** §9.2 component catalogue on sample data. Dev only. */
export default function ComponentsPage() {
  if (process.env.NODE_ENV === 'production' && process.env.SHOW_DEV_PAGES !== '1') notFound();
  const depth = r.cards.find((c) => c.id === 'depth');

  return (
    <div className="mx-auto max-w-page space-y-6 px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-bold tracking-display">Components</h1>
      <Card title="Pills and badges">
        <div className="flex flex-wrap items-center gap-2">
          {(['pass', 'warn', 'fail', 'info', 'manual'] as const).map((s) => <StatusPill key={s} status={s} />)}
          {(['critical', 'high', 'medium', 'low'] as const).map((s) => <SeverityPill key={s} severity={s} />)}
          <IssueBadge count={3} worst="fail" />
          <IssueBadge count={1} worst="warn" />
          <IssueBadge count={0} worst="pass" />
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="ScoreGauge"><div className="flex justify-center"><ScoreGauge score={r.overall.score} label={r.overall.label} /></div></Card>
        <Card title="CategoryBars"><CategoryBars categories={r.categories} /></Card>
        <Card title="SeverityDonut"><SeverityDonut counts={r.severityCounts} /></Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="StackedBar"><StackedBar segments={r.sitemap.segments} /></Card>
        <Card title="HBarList">{depth?.chart?.kind === 'hbar' && <HBarList rows={depth.chart.rows} />}</Card>
        <Card title="CwvTile"><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{r.cwv.metrics.map((m) => <CwvTile key={m.id} metric={m} />)}</div></Card>
        <Card title="StatTile"><div className="grid grid-cols-2 gap-3"><StatTile value="412" label="Pages crawled" /><StatTile value="47" label="Error pages" hint="11% of crawl" /></div></Card>
        <Card title="StatusRow"><ul>{r.robots.rows.map((row) => <StatusRow key={row.ruleId} row={row} mode="expert" />)}</ul></Card>
        <Card title="CodeBlock"><CodeBlock code={r.robots.suggested} label="Suggested robots.txt" /></Card>
        <Card title="ScoreAfterFixes"><ScoreAfterFixes today={r.overall.score} after={r.overall.afterFixes} /></Card>
      </div>
      <Banner variant="alert" title="Alert banner">One-sentence summary built from the top three issues.</Banner>
      <Banner variant="soft" title="Soft banner">Sales CTA variant — hidden behind FEATURE_SALES_SECTIONS.</Banner>
      <Card title="TopIssuesList"><TopIssuesList issues={r.topIssues.slice(0, 3)} mode="expert" /></Card>
    </div>
  );
}
