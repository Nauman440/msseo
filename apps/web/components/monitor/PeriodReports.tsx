import Link from 'next/link';
import { reportPdfHref } from '@/lib/report-docs';
import { PdfLink } from './PdfLink';

/**
 * Reports tab: the six-month action plan as a PDF, then month by month (newest first) one report per
 * week and a combined report for the whole month, each to open or download as a PDF.
 */
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const OPEN = 'inline-flex min-h-10 items-center rounded-control px-3 text-sm font-semibold text-primary-heading underline';

export function PeriodReports({ domain, months }: { domain: string; months: { month: string; weeks: string[] }[] }) {
  const site = encodeURIComponent(domain);
  return (
    <>
      <section aria-labelledby="plan-pdf" className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-primary-tint bg-primary-wash px-5 py-4">
        <div className="min-w-0">
          <h2 id="plan-pdf" className="font-display text-lg font-bold">Your 6-month action plan</h2>
          <p className="text-sm text-ink-2">Every fix, month by month, with its status and who approves it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/my/actions?site=${site}`} className={OPEN}>Open plan</Link>
          <PdfLink href={reportPdfHref(domain, { kind: 'plan' })} label="Download plan (PDF)" primary />
        </div>
      </section>

      <section aria-labelledby="period-reports" className="flex flex-col gap-3">
        <div>
          <h2 id="period-reports" className="font-display text-xl font-bold">Weekly and monthly reports</h2>
          <p className="text-sm text-ink-2">A report every week after the Monday check, and one combined report for each month.</p>
        </div>
        {!months.length ? (
          <p className="rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm text-ink-2">The first weekly report appears after the first Monday check of this website.</p>
        ) : (
          months.map(({ month, weeks }) => (
            <div key={month} className="overflow-hidden rounded-[18px] border border-border bg-surface">
              <h3 className="border-b border-border bg-canvas px-5 py-3 font-bold">{monthName(month)}</h3>
              <ul className="divide-y divide-border">
                {weeks.map((d, i) => (
                  <li key={d} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <p className="min-w-0 flex-1 text-sm">
                      <span className="font-semibold">Week {i + 1}</span> <span className="text-ink-2">· {weekName(d)}</span>
                    </p>
                    <Link href={`/my/reports/weekly?site=${site}&date=${d}`} className={OPEN}>Open</Link>
                    <PdfLink href={reportPdfHref(domain, { kind: 'week', date: d })} label="PDF" />
                  </li>
                ))}
                <li className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-primary-wash/40 px-5 py-3">
                  <p className="min-w-0 flex-1 text-sm font-bold">Whole month · combined report</p>
                  <Link href={`/my/reports/monthly?site=${site}&month=${month}`} className={OPEN}>Open</Link>
                  <PdfLink href={reportPdfHref(domain, { kind: 'month', month })} label="PDF" />
                </li>
              </ul>
            </div>
          ))
        )}
      </section>
    </>
  );
}
