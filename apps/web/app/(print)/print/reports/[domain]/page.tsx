import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { normDomain } from '@seo/core';
import { ActionPlanPrint } from '@/components/actions/ActionPlanPrint';
import { MonthlyReportView } from '@/components/monitor/MonthlyReportView';
import { WeeklyReportView } from '@/components/monitor/WeeklyReportView';
import { getActions } from '@/lib/actions';
import { competitorAccess } from '@/lib/competitors';
import { getMonthlyReport, getWeeklyReport } from '@/lib/monitor';
import { reportDocument } from '@/lib/report-docs';

export const metadata: Metadata = { title: 'Report' };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }>; searchParams: Promise<{ kind?: string; date?: string; month?: string }> };

/** CSS string literal for the @page footer; strips characters that could end the string. */
const cssString = (s: string) => `"${s.replace(/["\\\n<>]/g, '')}"`;

/**
 * What Playwright renders to PDF for the Reports tab: one week, a whole month, or the six-month action
 * plan, for the team or the site's customer (the caller's login is forwarded by the PDF route).
 */
export default async function PrintSiteReport({ params, searchParams }: Props) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!(await competitorAccess(domain))) notFound();
  const doc = reportDocument(await searchParams);
  if (!doc) notFound();
  return (
    <>
      <style>{`@page { @bottom-left { content: ${cssString(`MS SCORE · ${domain}`)}; font: 500 8pt var(--font-body), sans-serif; color: #64748b; } }`}</style>
      <div className="pdf-flow flex flex-col gap-[22px] px-2 py-4">
        {doc.kind === 'week' && <WeeklyReportView r={await getWeeklyReport(domain, doc.date)} readOnly />}
        {doc.kind === 'month' && <MonthlyReportView r={await getMonthlyReport(domain, doc.month)} toolbar={null} readOnly />}
        {doc.kind === 'plan' && <ActionPlanPrint ws={await getActions(domain)} />}
      </div>
    </>
  );
}
