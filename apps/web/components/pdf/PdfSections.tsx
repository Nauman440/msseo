import { TOP_ISSUES_LIMIT, type Audience, type CheckCard, type ReportModel } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { CategoryBars } from '@/components/report/CategoryBars';
import { CheckCardView, isCardVisible } from '@/components/report/CheckCardView';
import { CwvTile } from '@/components/report/CwvTile';
import { ScoreAfterFixes } from '@/components/report/ScoreAfterFixes';
import { SeverityDonut } from '@/components/report/SeverityDonut';
import { StackedBar } from '@/components/report/StackedBar';
import { TopIssuesList } from '@/components/report/TopIssuesList';
import { CrawlFiles } from '@/components/report/ReportSections';

/*
 * PDF compositions. No md:/lg: classes here: in print the viewport is the A4
 * content box (~673px), so breakpoint layouts would differ from the screen preview.
 */

export function PdfHeading({ n, title, intro }: { n: string; title: string; intro?: string }) {
  return (
    <header className="pdf-avoid mb-6">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-primary tabular">Section {n}</p>
      <h2 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-display">{title}</h2>
      {intro && <p className="mt-2 max-w-[150mm] text-sm leading-6 text-ink-2">{intro}</p>}
    </header>
  );
}

export function PdfSummary({ report, summary, mode }: { report: ReportModel; summary: string; mode: Audience }) {
  const { healthy, warnings, errors } = report.pageHealth;
  return (
    <section>
      <PdfHeading n="01" title="Executive summary" />
      <p className="pdf-avoid border-l-[3px] border-chart-high pl-5 font-display text-lg font-medium leading-8 tracking-tight">
        {summary}
      </p>
      <div className="mt-8 grid grid-cols-2 gap-4">
        <Card title="Score by category">
          <CategoryBars categories={report.categories} />
        </Card>
        <div className="grid grid-cols-1 gap-4">
          <Card title="Issues by severity">
            <SeverityDonut counts={report.severityCounts} size={112} />
          </Card>
          <Card title="Page health">
            <StackedBar
              segments={[
                { label: 'Healthy', value: healthy, tone: 'pass' },
                { label: 'Warnings', value: warnings, tone: 'warn' },
                { label: 'Errors', value: errors, tone: 'fail' },
              ]}
            />
          </Card>
        </div>
      </div>
      <Card title="Core Web Vitals" eyebrow={`Mobile · ${report.cwv.source === 'field' ? 'real-user field data' : 'lab data'}`} className="mt-4">
        <div className="grid grid-cols-3 gap-3">
          {report.cwv.metrics.map((m) => (
            <CwvTile key={m.id} metric={m} />
          ))}
        </div>
      </Card>
      {mode === 'client' && (
        <p className="mt-6 text-xs leading-5 text-ink-3">
          Scores run from 0 to 100. 90+ is good, 70–89 needs work, 50–69 is poor and under 50 is critical.
        </p>
      )}
    </section>
  );
}

export function PdfTopIssues({ report, mode }: { report: ReportModel; mode: Audience }) {
  return (
    <section className="pdf-section">
      <PdfHeading
        n="02"
        title="Top issues to fix first"
        intro={mode === 'client' ? 'Ordered by how much each fix helps compared with the effort it takes.' : 'Ordered by ICE priority (impact × confidence ÷ effort).'}
      />
      <Card>
        <TopIssuesList issues={report.topIssues.slice(0, TOP_ISSUES_LIMIT[mode])} mode={mode} />
      </Card>
    </section>
  );
}

function PdfCheckGrid({ cards, mode }: { cards: CheckCard[]; mode: Audience }) {
  return (
    <div className="grid grid-cols-2 items-start gap-4">
      {cards.filter((c) => isCardVisible(c, mode)).map((card) => (
        <CheckCardView key={card.id} card={card} mode={mode} />
      ))}
    </div>
  );
}

export function PdfChecks({ report, mode }: { report: ReportModel; mode: Audience }) {
  return (
    <>
      <section className="pdf-section">
        <PdfHeading n="03" title="Technical SEO" intro="Whether search engines can find, crawl and index the site correctly." />
        <CrawlFiles report={report} mode={mode} />
        <div className="mt-4">
          <PdfCheckGrid cards={report.cards.filter((c) => c.section === 'technical')} mode={mode} />
        </div>
      </section>
      <section className="pdf-section">
        <PdfHeading n="04" title="On-page SEO" intro="How well each page tells search engines and visitors what it is about." />
        <PdfCheckGrid cards={report.cards.filter((c) => c.section === 'onpage')} mode={mode} />
      </section>
    </>
  );
}

export function PdfNextSteps({ report }: { report: ReportModel }) {
  return (
    <section className="pdf-section">
      <PdfHeading n="05" title="Where fixes take the site" />
      <Card className="pdf-avoid">
        <div className="grid grid-cols-[auto_1fr] items-center gap-10">
          <ScoreAfterFixes today={report.overall.score} after={report.overall.afterFixes} />
          <p className="text-[15px] leading-7 text-ink-2">
            Resolving the {report.severityCounts.critical} critical and {report.severityCounts.high} high-priority
            issues is projected to lift the health score from{' '}
            <strong className="text-ink tabular">{report.overall.score}</strong> to{' '}
            <strong className="text-pass-text tabular">{report.overall.afterFixes}</strong>.
          </p>
        </div>
      </Card>
      <div className="pdf-avoid mt-8 rounded-card bg-night p-7 text-white">
        <p className="font-display text-xl font-semibold tracking-tight">Next steps</p>
        <ol className="mt-4 space-y-2.5 text-sm leading-6 text-white/75">
          <li><span className="mr-2 font-semibold text-brand">1.</span>Agree the fix list and order with {report.brand}.</li>
          <li><span className="mr-2 font-semibold text-brand">2.</span>Critical and high issues are fixed first, usually within two weeks.</li>
          <li><span className="mr-2 font-semibold text-brand">3.</span>We re-run this audit to confirm the improvement.</li>
        </ol>
      </div>
    </section>
  );
}
