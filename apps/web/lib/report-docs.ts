/**
 * The documents on the Reports tab: a weekly report (by its snapshot date), a whole month, or the
 * six-month action plan. Parsed once here so the print page, the PDF route and the links agree.
 */
export type ReportDoc = { kind: 'week'; date: string } | { kind: 'month'; month: string } | { kind: 'plan' };

export function reportDocument(q: { kind?: string; date?: string; month?: string }): ReportDoc | null {
  if (q.kind === 'week' && q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) return { kind: 'week', date: q.date };
  if (q.kind === 'month' && q.month && /^\d{4}-\d{2}$/.test(q.month)) return { kind: 'month', month: q.month };
  if (q.kind === 'plan') return { kind: 'plan' };
  return null;
}

export const reportQuery = (d: ReportDoc) => (d.kind === 'week' ? `kind=week&date=${d.date}` : d.kind === 'month' ? `kind=month&month=${d.month}` : 'kind=plan');

export const reportPdfHref = (domain: string, d: ReportDoc) => `/api/reports/${encodeURIComponent(domain)}/pdf?${reportQuery(d)}`;

export function reportFileName(domain: string, d: ReportDoc): string {
  const site = domain.replace(/[^a-z0-9.-]/gi, '');
  return d.kind === 'week' ? `weekly-report-${site}-${d.date}.pdf` : d.kind === 'month' ? `monthly-report-${site}-${d.month}.pdf` : `action-plan-${site}.pdf`;
}
