import type { Metadata } from 'next';
import Link from 'next/link';
import { MonthlyReportView } from '@/components/monitor/MonthlyReportView';
import { loadCustomerSite } from '@/lib/customer-site';
import { getMonthlyReport } from '@/lib/monitor';

export const metadata: Metadata = { title: 'Monthly report' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string; month?: string }> };
const lastMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
};

/** 13.3 The customer's monthly report for one of their websites (print or save as PDF). */
export default async function CustomerMonthlyReportPage({ searchParams }: Props) {
  const { site, month: q } = await searchParams;
  const s = await loadCustomerSite(site);
  const month = q && /^\d{4}-\d{2}$/.test(q) ? q : lastMonth();
  const r = await getMonthlyReport(s.domain, month);
  return (
    <>
      <Link href={`/my/monitor?site=${encodeURIComponent(s.domain)}`} className="text-sm font-semibold text-primary-heading underline print:hidden">← Monitoring</Link>
      <MonthlyReportView r={r} />
    </>
  );
}
