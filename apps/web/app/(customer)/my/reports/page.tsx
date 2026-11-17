import type { Metadata } from 'next';
import Link from 'next/link';
import { diffReports } from '@seo/core';
import { SiteHeader } from '@/components/customer/SiteHeader';
import { ChangesSinceLast } from '@/components/project/ChangesSinceLast';
import { ScoreTrend } from '@/components/project/ScoreTrend';
import { Card } from '@/components/ui/Card';
import { loadCustomerSite } from '@/lib/customer-site';
import { cn } from '@/lib/tones';

export const metadata: Metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const scoreTone = (s: number) => (s >= 90 ? 'bg-pass-bg text-pass-text' : s >= 70 ? 'bg-warn-bg text-warn-text' : 'bg-high-bg text-high-text');

/** Reports tab: score over time, changes since the last audit, and every audit with its PDF. */
export default async function ReportsPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const trend = [...s.rows]
    .reverse()
    .filter((r) => r.status === 'completed' && r.score !== null)
    .map((r) => ({ date: r.createdAt.slice(0, 10), score: r.score!, href: `/my/reports/${r.id}` }));
  return (
    <>
      <SiteHeader domain={s.domain} tab="reports" connected={s.connected} latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Score over time">
          <ScoreTrend points={trend} />
        </Card>
        <Card title="Since your last audit">
          {s.latest && s.previous ? <ChangesSinceLast diff={diffReports(s.previous, s.latest)} /> : <p className="text-sm text-ink-2">Changes appear after your second audit.</p>}
        </Card>
      </div>
      <section aria-labelledby="audits" className="flex flex-col gap-3">
        <h2 id="audits" className="font-display text-xl font-bold">Your audits</h2>
        {s.rows.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-surface">
            {s.rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
                <p className="min-w-0 flex-1 font-semibold">{day(r.createdAt)}</p>
                {r.score !== null ? (
                  <span className={cn('rounded-pill px-2.5 py-1 text-sm font-bold tabular', scoreTone(r.score))}>{r.score}</span>
                ) : (
                  <span className="text-[13px] font-semibold text-ink-3">{r.status === 'running' ? 'Running' : 'Did not finish'}</span>
                )}
                <Link href={`/my/reports/${r.id}`} className="inline-flex min-h-10 items-center rounded-control border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">
                  {r.status === 'completed' ? 'Open report' : 'View'}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No audits yet.</p>
        )}
      </section>
    </>
  );
}
