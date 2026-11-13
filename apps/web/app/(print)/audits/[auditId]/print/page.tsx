import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getReport, parseMode, reportSummary } from '@/lib/reports';
import { PdfCover } from '@/components/pdf/PdfCover';
import { PdfChecks, PdfNextSteps, PdfSummary, PdfTopIssues } from '@/components/pdf/PdfSections';
import { PrintToolbar } from '@/components/pdf/PrintToolbar';

type Props = {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const report = await getReport((await params).auditId);
  return { title: report ? `${report.project.domain} — SEO audit` : 'Report not found' };
}

/** CSS string literal for the @page footer; strips characters that could end the string. */
const cssString = (s: string) => `"${s.replace(/["\\\n<>]/g, '')}"`;

export default async function PrintReportPage({ params, searchParams }: Props) {
  const report = await getReport((await params).auditId);
  if (!report) notFound();
  const mode = parseMode((await searchParams).mode, report.audience);
  const summary = reportSummary(report)[mode];
  const footer = `${report.brand} · ${report.project.domain}`;

  return (
    <>
      <style>{`@page { @bottom-left { content: ${cssString(footer)}; font: 500 8pt var(--font-inter), sans-serif; color: #857a72; } }`}</style>
      <PrintToolbar backHref={`/audits/${report.auditId}?mode=${mode}`} auditId={report.auditId} mode={mode} />
      <PdfCover report={report} mode={mode} />
      <div className="pdf-flow">
        <PdfSummary report={report} summary={summary} mode={mode} />
        <PdfTopIssues report={report} mode={mode} />
        <PdfChecks report={report} mode={mode} />
        <PdfNextSteps report={report} />
      </div>
    </>
  );
}
