import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAuditView, getReport, parseMode, typicalDurationSeconds } from '@/lib/reports';
import { AiPendingCard } from '@/components/report/AiPendingCard';
import { AiRecommendationsCard } from '@/components/report/AiRecommendationsCard';
import { AuditProgress } from '@/components/report/AuditProgress';
import { Banner, ReportBanner } from '@/components/report/Banner';
import { ReportHeader } from '@/components/report/ReportHeader';
import { ReportOverview } from '@/components/report/ReportOverview';
import { PagesAudited, WorkingWell } from '@/components/report/Strengths';
import { AfterFixes, CheckGrid, CrawlFiles, SectionTitle } from '@/components/report/ReportSections';
import { SpeedByTemplate } from '@/components/report/SpeedByTemplate';
import { rowExtras } from '@/components/report/StatusRow';
import { CompetitorSummary } from '@/components/competitors/CompetitorSummary';
import { getSavedWorkspace } from '@/lib/competitors';
import { getActions } from '@/lib/actions';
import { ActionPlanSummary } from '@/components/actions/ActionPlanSummary';

type Props = {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const report = await getReport((await params).auditId);
  return { title: report ? `${report.project.domain} report` : 'Audit' };
}

/** Link to the project page (database only; the demo report has none). */
async function projectHref(auditId: string): Promise<string | undefined> {
  if (!process.env.DATABASE_URL || auditId === 'demo') return undefined;
  const { projectIdForAudit } = await import('@seo/db');
  const id = await projectIdForAudit(auditId).catch(() => null);
  return id ? `/projects/${id}` : undefined;
}

export default async function ReportPage({ params, searchParams }: Props) {
  const view = await getAuditView((await params).auditId);
  if (!view) notFound();
  if (view.kind === 'progress') {
    const { id, input, status, progress, steps, error, createdAt, finishedAt } = view.record;
    const typical = await typicalDurationSeconds(input.pageLimit, input.auditMode ?? 'deep');
    return (
      <AuditProgress
        key={createdAt}
        id={id}
        url={input.url}
        pageLimit={input.pageLimit}
        typical={typical}
        initial={{ status, progress, steps, error, createdAt, finishedAt }}
      />
    );
  }
  const report = view.report;
  const mode = parseMode((await searchParams).mode, report.audience);
  const extras = rowExtras(report);
  const [competitors, actions] = report.auditId === 'demo' ? [null, null] : await Promise.all([getSavedWorkspace(report.project.domain), getActions(report.project.domain)]);

  return (
    <>
      <ReportHeader report={report} mode={mode} projectHref={await projectHref(report.auditId)} />
      <div className="mx-auto max-w-page space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <ReportBanner report={report} mode={mode} />
        {report.notices?.map((n) => (
          <Banner key={n.expert} variant="soft" title="About this audit">
            {n[mode]}
          </Banner>
        ))}

        <ReportOverview report={report} mode={mode} />
        <WorkingWell report={report} mode={mode} />

        {report.ai ? <AiRecommendationsCard ai={report.ai} mode={mode} /> : report.aiPending && <AiPendingCard auditId={report.auditId} />}

        <SectionTitle n="01" title="Crawl files" note="robots.txt and sitemap.xml" />
        <CrawlFiles report={report} mode={mode} extras={extras} />

        <SectionTitle n="02" title="Technical SEO checks" note={mode === 'client' ? 'Only cards with issues are shown' : undefined} />
        <CheckGrid cards={report.cards.filter((c) => c.section === 'technical')} mode={mode} extras={extras} />
        {mode === 'expert' && report.speedByTemplate?.length ? <SpeedByTemplate rows={report.speedByTemplate} /> : null}

        {report.gscProperty && (
          <>
            <SectionTitle n="03" title="Search Console" />
            <CheckGrid cards={report.cards.filter((c) => c.section === 'gsc')} mode={mode} extras={extras} />
          </>
        )}

        {report.cards.some((c) => c.section === 'onpage') && (
          <>
            <SectionTitle n={report.gscProperty ? '04' : '03'} title="On-page SEO checks" />
            <CheckGrid cards={report.cards.filter((c) => c.section === 'onpage')} mode={mode} extras={extras} />
          </>
        )}

        <PagesAudited report={report} mode={mode} />
        {competitors && <CompetitorSummary ws={competitors} href={`/competitors/${competitors.domain}`} />}
        {actions && <ActionPlanSummary ws={actions} href={`/action-plan/${actions.domain}`} />}

        <div className="pt-4">
          <AfterFixes report={report} />
        </div>
      </div>
    </>
  );
}
