import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/landing/Closing';
import { TopBar } from '@/components/landing/Hero';
import { Banner } from '@/components/report/Banner';
import { AuditProgress } from '@/components/report/AuditProgress';
import { ReportOverview } from '@/components/report/ReportOverview';
import { CheckGrid, SectionTitle } from '@/components/report/ReportSections';
import { getAudit } from '@/lib/audit-store';
import { getAuditView, reportSummary, typicalDurationSeconds } from '@/lib/reports';

export const dynamic = 'force-dynamic';
// A visitor's own report: never indexed, never cached.
export const metadata: Metadata = { title: 'Your free SEO audit', robots: { index: false, follow: false } };

type Props = { params: Promise<{ auditId: string }> };

/** Free audit progress, then the free report with the trial call to action (step 8). */
export default async function FreeReportPage({ params }: Props) {
  const auditId = (await params).auditId;
  // Only audits started from the public form are shown here (ids are random UUIDs).
  if ((await getAudit(auditId))?.input.source !== 'public') notFound();
  const view = await getAuditView(auditId);
  if (!view) notFound();

  if (view.kind === 'progress') {
    const { id, input, status, progress, steps, error, createdAt, finishedAt } = view.record;
    const typical = await typicalDurationSeconds(input.pageLimit, 'quick');
    return (
      <>
        <TopBar />
        <main id="main" className="bg-canvas">
          <AuditProgress key={createdAt} id={id} url={input.url} pageLimit={input.pageLimit} typical={typical} initial={{ status, progress, steps, error, createdAt, finishedAt }} variant="public" />
        </main>
        <SiteFooter />
      </>
    );
  }

  const report = view.report;
  const summary = reportSummary(report).client;
  const trialHref = `/signup?audit=${encodeURIComponent(report.auditId)}`;
  return (
    <>
      <TopBar />
      <main id="main" className="bg-canvas">
        <div className="border-b border-border bg-surface">
          <div className="mx-auto max-w-page px-4 py-8 sm:px-6">
            <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-primary-text">Your free SEO audit</p>
            <h1 className="mt-2 break-all font-display text-[30px] font-bold tracking-display sm:text-[36px]">{report.project.domain}</h1>
            <p className="mt-2 text-[15px] text-ink-2">{report.pagesCrawled} pages checked · {new Date(report.crawledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <div className="mx-auto max-w-page space-y-6 px-4 py-8 sm:px-6 sm:py-10">
          <Banner variant="alert" title={`${report.overall.label}: ${report.severityCounts.critical} critical ${report.severityCounts.critical === 1 ? 'issue needs' : 'issues need'} attention`}>
            {summary}
          </Banner>

          <TrialCta href={trialHref} score={report.overall.score} after={report.overall.afterFixes} />

          <ReportOverview report={report} mode="client" />

          <SectionTitle n="01" title="Technical SEO checks" note="Only cards with issues are shown" />
          <CheckGrid cards={report.cards.filter((c) => c.section === 'technical')} mode="client" />
          {report.cards.some((c) => c.section === 'onpage') && (
            <>
              <SectionTitle n="02" title="On-page SEO checks" />
              <CheckGrid cards={report.cards.filter((c) => c.section === 'onpage')} mode="client" />
            </>
          )}

          <TrialCta href={trialHref} score={report.overall.score} after={report.overall.afterFixes} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function TrialCta({ href, score, after }: { href: string; score: number; after: number }) {
  return (
    <section className="flex flex-col gap-5 rounded-panel bg-night p-6 text-mist sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div className="max-w-xl">
        <h2 className="font-display text-[24px] font-bold leading-tight tracking-display">Want us to fix these for you?</h2>
        <p className="mt-2 text-[15px] leading-7 text-mist-2">
          Fixing the critical and high issues can take your score from <strong className="text-mist tabular">{score}</strong> to{' '}
          <strong className="text-brand tabular">{after}</strong>. Start a 7-day free trial: weekly audits and fixes you approve. No card needed.
        </p>
      </div>
      <Link href={href} className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-button bg-primary px-6 text-base font-extrabold text-primary-ink hover:bg-primary-hover">
        Start 7-day free trial
      </Link>
    </section>
  );
}
