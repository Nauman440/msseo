import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAuditView, getReport, parseMode, reportSummary } from '@/lib/reports';
import { AuditProgress } from '@/components/report/AuditProgress';
import { Banner } from '@/components/report/Banner';
import { ReportHeader } from '@/components/report/ReportHeader';
import { ReportOverview } from '@/components/report/ReportOverview';
import { AfterFixes, CheckGrid, CrawlFiles, SectionTitle } from '@/components/report/ReportSections';

type Props = {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const report = await getReport((await params).auditId);
  return { title: report ? `${report.project.domain} report` : 'Audit' };
}

export default async function ReportPage({ params, searchParams }: Props) {
  const view = await getAuditView((await params).auditId);
  if (!view) notFound();
  if (view.kind === 'progress') {
    const { id, input, status, progress, steps, error } = view.record;
    return <AuditProgress id={id} url={input.url} initial={{ status, progress, steps, error }} />;
  }
  const report = view.report;
  const mode = parseMode((await searchParams).mode, report.audience);
  const summary = reportSummary(report);

  return (
    <>
      <ReportHeader report={report} mode={mode} />
      <div className="mx-auto max-w-page space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <Banner variant="alert" title={`${report.overall.label}: ${report.severityCounts.critical} critical ${report.severityCounts.critical === 1 ? 'issue needs' : 'issues need'} attention`}>
          {summary[mode]}
        </Banner>
        {report.notices?.map((n) => (
          <Banner key={n.expert} variant="soft" title="About this audit">
            {n[mode]}
          </Banner>
        ))}

        <ReportOverview report={report} mode={mode} />

        <SectionTitle n="01" title="Crawl files" note="robots.txt and sitemap.xml" />
        <CrawlFiles report={report} mode={mode} />

        <SectionTitle n="02" title="Technical SEO checks" note={mode === 'client' ? 'Only cards with issues are shown' : undefined} />
        <CheckGrid cards={report.cards.filter((c) => c.section === 'technical')} mode={mode} />

        {report.gscProperty && (
          <>
            <SectionTitle n="03" title="Search Console" />
            <CheckGrid cards={report.cards.filter((c) => c.section === 'gsc')} mode={mode} />
          </>
        )}

        {report.cards.some((c) => c.section === 'onpage') && (
          <>
            <SectionTitle n={report.gscProperty ? '04' : '03'} title="On-page SEO checks" />
            <CheckGrid cards={report.cards.filter((c) => c.section === 'onpage')} mode={mode} />
          </>
        )}

        <div className="pt-4">
          <AfterFixes report={report} />
        </div>
      </div>
    </>
  );
}
