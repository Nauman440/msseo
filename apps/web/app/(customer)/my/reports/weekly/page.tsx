import type { Metadata } from 'next';
import Link from 'next/link';
import { PdfLink } from '@/components/monitor/PdfLink';
import { WeeklyReportView } from '@/components/monitor/WeeklyReportView';
import { loadCustomerSite } from '@/lib/customer-site';
import { getWeeklyReport } from '@/lib/monitor';
import { reportPdfHref } from '@/lib/report-docs';

export const metadata: Metadata = { title: 'Weekly report' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string; date?: string }> };

/** 13.2 The customer's report for one week of one website, with its PDF. */
export default async function CustomerWeeklyReportPage({ searchParams }: Props) {
  const { site, date: q } = await searchParams;
  const s = await loadCustomerSite(site);
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 10);
  const r = await getWeeklyReport(s.domain, date);
  return (
    <>
      <Link href={`/my/reports?site=${encodeURIComponent(s.domain)}`} className="text-sm font-semibold text-primary-heading underline print:hidden">← Reports</Link>
      <WeeklyReportView r={r} toolbar={<PdfLink href={reportPdfHref(s.domain, { kind: 'week', date })} />} />
    </>
  );
}
