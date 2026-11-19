import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { Container } from '@/components/landing/primitives';
import { MonthlyReportView } from '@/components/monitor/MonthlyReportView';
import { getMonthlyReport } from '@/lib/monitor';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }>; searchParams: Promise<{ month?: string }> };

export const metadata: Metadata = { title: 'Monthly report' };
const lastMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
};

/** 13.3 Monthly report for the team (print it or save it as PDF for the client). */
export default async function TeamMonthlyReportPage({ params, searchParams }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const q = (await searchParams).month;
  const month = q && /^\d{4}-\d{2}$/.test(q) ? q : lastMonth();
  const r = await getMonthlyReport(domain, month);
  return (
    <Container className="flex flex-col gap-6 py-12">
      <Link href={`/monitor/${domain}`} className="text-sm font-semibold text-primary-heading underline print:hidden">← Monitoring</Link>
      <MonthlyReportView r={r} />
    </Container>
  );
}
