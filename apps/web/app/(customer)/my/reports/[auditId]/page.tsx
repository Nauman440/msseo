import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuditProgress } from '@/components/report/AuditProgress';
import { ReportBanner } from '@/components/report/Banner';
import { DownloadPdfButton } from '@/components/report/DownloadPdfButton';
import { ReportOverview } from '@/components/report/ReportOverview';
import { CheckGrid, SectionTitle } from '@/components/report/ReportSections';
import { CompetitorSummary } from '@/components/competitors/CompetitorSummary';
import { canViewAudit } from '@/lib/access';
import { getSavedWorkspace } from '@/lib/competitors';
import { getActions } from '@/lib/actions';
import { ActionPlanSummary } from '@/components/actions/ActionPlanSummary';
import { getAuditView, typicalDurationSeconds } from '@/lib/reports';
import { requireCustomer } from '@/lib/session';

export const metadata: Metadata = { title: 'Your SEO report' };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ auditId: string }>; searchParams: Promise<{ site?: string }> };

/** A customer's report (client language), or its progress while it runs (step 8). */
export default async function CustomerReportPage({ params, searchParams }: Props) {
  await requireCustomer();
  const auditId = (await params).auditId;
  if (!(await canViewAudit(auditId))) notFound();
  const view = await getAuditView(auditId);
  if (!view) notFound();

  if (view.kind === 'progress') {
    const { id, input, status, progress, steps, error, createdAt, finishedAt } = view.record;
    const typical = await typicalDurationSeconds(input.pageLimit, input.auditMode ?? 'quick');
    return <AuditProgress key={createdAt} id={id} url={input.url} pageLimit={input.pageLimit} typical={typical} initial={{ status, progress, steps, error, createdAt, finishedAt }} variant="customer" />;
  }

  const report = view.report;
  // The address names the report's own website, so the switcher (and the remembered website) follow it.
  if ((await searchParams).site !== report.project.domain) redirect(`/my/reports/${auditId}?site=${encodeURIComponent(report.project.domain)}`);
  const [competitors, actions] = await Promise.all([getSavedWorkspace(report.project.domain), getActions(report.project.domain)]);
  return (
    <>
      <div className="rounded-[18px] border border-border bg-surface">
        <div className="flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-7">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink-3">
              <Link href={`/my?site=${encodeURIComponent(report.project.domain)}`} className="hover:text-ink">← {report.project.domain} overview</Link>
            </p>
            <h1 className="mt-2 break-all font-display text-[30px] font-bold tracking-display sm:text-[36px]">{report.project.domain}</h1>
            <p className="mt-1 text-[14px] text-ink-2">{report.pagesCrawled} pages checked · {new Date(report.crawledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <DownloadPdfButton auditId={report.auditId} mode="client" />
            <a href={`/api/audits/${report.auditId}/markdown?mode=client`} download className="inline-flex min-h-10 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold text-ink hover:border-ink-3">
              Download .md
            </a>
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <ReportBanner report={report} mode="client" />
        <ReportOverview report={report} mode="client" />
        <SectionTitle n="01" title="Technical SEO checks" note="Only cards with issues are shown" />
        <CheckGrid cards={report.cards.filter((c) => c.section === 'technical')} mode="client" />
        {report.cards.some((c) => c.section === 'onpage') && (
          <>
            <SectionTitle n="02" title="On-page SEO checks" />
            <CheckGrid cards={report.cards.filter((c) => c.section === 'onpage')} mode="client" />
          </>
        )}
        {competitors && <CompetitorSummary ws={competitors} href={`/my/competitors?site=${competitors.domain}`} />}
        <ActionPlanSummary ws={actions} href={`/my/actions?site=${actions.domain}`} />
      </div>
    </>
  );
}
