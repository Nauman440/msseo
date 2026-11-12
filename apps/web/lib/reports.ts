import { buildSummary, sampleReport, type Audience, type ReportModel } from '@seo/core';

/**
 * Report lookup. Phase 1 replaces the demo branch with `prisma.audit.findUnique`
 * and reads `Audit.report`; the page components only ever see a ReportModel.
 */
export async function getReport(auditId: string): Promise<ReportModel | null> {
  if (auditId === 'demo') return sampleReport;
  return null;
}

export function parseMode(value: string | string[] | undefined, fallback: Audience): Audience {
  return value === 'expert' || value === 'client' ? value : fallback;
}

export function reportSummary(report: ReportModel) {
  return buildSummary(report);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}
