import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getReport, parseMode, reportSummary } from '@/lib/reports';
import { Banner } from '@/components/report/Banner';
import { ReportHeader } from '@/components/report/ReportHeader';
import { ReportOverview } from '@/components/report/ReportOverview';
import { AfterFixes, CheckGrid, CrawlFiles, SectionTitle } from '@/components/report/ReportSections';

type Props = {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const report = await getReport((await params).auditId);
  return { title: report ? `${report.project.domain} report` : 'Report not found' };
}

export default async function ReportPage({ params, searchParams }: Props) {
  const report = await getReport((await params).auditId);
  if (!report) notFound();
  const mode = parseMode((await searchParams).mode, report.audience);
  const summary = reportSummary(report);

  return (
    <>
      <ReportHeader report={report} mode={mode} />
      <div className="mx-auto max-w-page space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <Banner variant="alert" title={`${report.overall.label}: ${report.severityCounts.critical} critical issues need attention`}>
          {summary[mode]}
        </Banner>

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

        <SectionTitle n={report.gscProperty ? '04' : '03'} title="On-page SEO checks" />
        <CheckGrid cards={report.cards.filter((c) => c.section === 'onpage')} mode={mode} />

        <div className="pt-4">
          <AfterFixes report={report} />
        </div>
      </div>
    </>
  );
}
