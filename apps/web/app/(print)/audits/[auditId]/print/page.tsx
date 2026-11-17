import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CompetitorSummary } from '@/components/competitors/CompetitorSummary';
import { canViewAudit } from '@/lib/access';
import { getSavedWorkspace } from '@/lib/competitors';
import { getReport, parseMode, reportSummary } from '@/lib/reports';
import { PdfCover } from '@/components/pdf/PdfCover';
import { PdfChecks, PdfNextSteps, PdfSummary, PdfTopIssues } from '@/components/pdf/PdfSections';
import { PrintToolbar } from '@/components/pdf/PrintToolbar';

type Props = {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ mode?: string | string[]; pdf_token?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const auditId = (await params).auditId;
  const report = (await canViewAudit(auditId, (await searchParams).pdf_token)) ? await getReport(auditId) : null;
  return { title: report ? `${report.project.domain} — SEO audit` : 'Report not found' };
}

/** CSS string literal for the @page footer; strips characters that could end the string. */
const cssString = (s: string) => `"${s.replace(/["\\\n<>]/g, '')}"`;

export default async function PrintReportPage({ params, searchParams }: Props) {
  const auditId = (await params).auditId;
  const query = await searchParams;
  // Team, the owning customer, or the worker rendering an emailed PDF (signed token).
  if (!(await canViewAudit(auditId, query.pdf_token))) notFound();
  const report = await getReport(auditId);
  if (!report) notFound();
  const mode = parseMode(query.mode, report.audience);
  const competitors = report.auditId === 'demo' ? null : await getSavedWorkspace(report.project.domain);
  const summary = reportSummary(report)[mode];
  const footer = `${report.brand} · ${report.project.domain}`;

  return (
    <>
      <style>{`@page { @bottom-left { content: ${cssString(footer)}; font: 500 8pt var(--font-body), sans-serif; color: #64748b; } }`}</style>
      <PrintToolbar backHref={`/audits/${report.auditId}?mode=${mode}`} auditId={report.auditId} mode={mode} />
      <PdfCover report={report} mode={mode} />
      <div className="pdf-flow">
        <PdfSummary report={report} summary={summary} mode={mode} />
        <PdfTopIssues report={report} mode={mode} />
        <PdfChecks report={report} mode={mode} />
        {competitors?.competitors.some((c) => c.shortlist !== 'none') && (
          <section className="pdf-section pdf-avoid">
            <CompetitorSummary ws={competitors} />
          </section>
        )}
        <PdfNextSteps report={report} />
      </div>
    </>
  );
}
