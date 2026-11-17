import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { diffReports } from '@seo/core';
import { ChangesSinceLast } from '@/components/project/ChangesSinceLast';
import { ScoreTrend } from '@/components/project/ScoreTrend';
import { RunAuditButton } from '@/components/customer/RunAuditButton';
import { MiniScore } from '@/components/signup/MiniScore';
import { TopIssuesList } from '@/components/report/TopIssuesList';
import { Card } from '@/components/ui/Card';
import { accountSites, domainOf, getAccountByUserId, PLANS } from '@/lib/accounts';
import { AddWebsiteForm } from '@/components/customer/AddWebsiteForm';
import { removeWebsiteAction } from './actions';
import { customerAudits } from '@/lib/customer-data';
import { requireCustomer } from '@/lib/session';
import { FINISHED, stepPath } from '@/lib/signup';
import { cn } from '@/lib/tones';

export const metadata: Metadata = { title: 'Your dashboard' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ welcome?: string; site?: string }> };

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const scoreTone = (s: number) => (s >= 90 ? 'bg-pass-bg text-pass-text' : s >= 70 ? 'bg-warn-bg text-warn-text' : 'bg-high-bg text-high-text');

/** Customer dashboard (step 8): trial, latest report, trend, changes, audit history. */
export default async function CustomerDashboard({ searchParams }: Props) {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  if (!account) redirect('/signup');
  if (account.onboardingStep < FINISHED) redirect(stepPath(account.onboardingStep));
  const { welcome, site } = await searchParams;
  const sites = accountSites(account);
  const current = sites.find((w) => domainOf(w) === site) ?? sites[0] ?? null;
  const { rows, latest, previous } = await customerAudits(current);
  const limit = PLANS[account.plan].websites;
  const plan = PLANS[account.plan];
  const trialLeft = Math.ceil((Date.parse(account.trialEndsAt) - Date.now()) / 86_400_000);
  const trend = [...rows]
    .reverse()
    .filter((r) => r.status === 'completed' && r.score !== null)
    .map((r) => ({ date: r.createdAt.slice(0, 10), score: r.score!, href: `/my/reports/${r.id}` }));
  const latestRow = rows.find((r) => r.status === 'completed');
  const running = rows.find((r) => r.status === 'running');

  return (
    <div className="mx-auto flex max-w-page flex-col gap-8 px-4 py-10 sm:px-6">
      {welcome && (
        <section role="status" className="rounded-panel bg-night p-6 text-mist sm:p-8">
          <h2 className="font-display text-[24px] font-bold">You are all set, {user.name.split(' ')[0]}</h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-7 text-mist-2">
            Your {plan.name} trial is running. Our team will be in touch to connect your accounts and agree the first fixes with you. Your website is checked again automatically every week.
          </p>
        </section>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary-text">Your website</p>
          <h1 className="mt-1 break-all font-display text-[30px] font-bold tracking-display sm:text-[36px]">{current ? domainOf(current) : account.businessName}</h1>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {current && (
            <Link href={`/my/competitors?site=${encodeURIComponent(domainOf(current))}`} className="inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-bold hover:border-ink-3">
              Competitors
            </Link>
          )}
          {current && (
            <Link href={`/my/keywords?site=${encodeURIComponent(domainOf(current))}`} className="inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-bold hover:border-ink-3">
              Keywords
            </Link>
          )}
          {current && <RunAuditButton disabled={Boolean(running)} site={domainOf(current)} />}
        </div>
      </div>

      {(sites.length > 1 || limit > 1) && (
        <nav aria-label="Your websites" className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
          <ul className="flex flex-wrap gap-2">
            {sites.map((w) => {
              const d = domainOf(w);
              const active = w === current;
              return (
                <li key={d} className="flex items-center">
                  <Link href={`/my?site=${encodeURIComponent(d)}`} aria-current={active ? 'page' : undefined} className={cn('inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold', active ? 'border-night bg-night text-mist' : 'border-border-strong hover:border-ink-3')}>
                    {d}
                  </Link>
                  {w !== account.website && (
                    <form action={removeWebsiteAction.bind(null, d)}>
                      <button type="submit" aria-label={`Remove ${d}`} className="ml-1 min-h-10 rounded-full px-2.5 text-sm text-ink-3 hover:text-fail-text">×</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          {sites.length < limit && <AddWebsiteForm left={limit - sites.length} />}
        </nav>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Your plan">
          <p className="font-display text-2xl font-bold">
            {plan.name} <span className="text-base font-semibold text-ink-3 tabular">{plan.price}{plan.unit}</span>
          </p>
          <p className="mt-2 text-sm text-ink-2">
            {account.status === 'trial'
              ? trialLeft > 0
                ? `Free trial: ${trialLeft} ${trialLeft === 1 ? 'day' : 'days'} left (until ${day(account.trialEndsAt)}). Nothing to pay today.`
                : 'Your free trial has ended. We will contact you to confirm your plan.'
              : account.status === 'active'
                ? 'Active.'
                : 'Cancelled.'}
          </p>
        </Card>
        <Card title="SEO health" className="lg:col-span-2">
          {latest && latestRow ? (
            <div className="flex flex-wrap items-center gap-6">
              <MiniScore score={latest.overall.score} size={96} onLight />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-ink-2">
                  <strong className="text-ink">{latest.overall.label}.</strong> Fixing the critical and high issues can lift this to{' '}
                  <strong className="text-pass-text tabular">{latest.overall.afterFixes}</strong>.
                </p>
                <p className="mt-1 text-[13px] text-ink-3">Last checked {day(latestRow.createdAt)} · {latest.pagesCrawled} pages</p>
                <Link href={`/my/reports/${latestRow.id}`} className="mt-3 inline-flex min-h-10 items-center rounded-button bg-primary px-4 text-sm font-semibold text-primary-ink hover:bg-primary-hover">
                  Open the full report
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-2">{running ? 'Your first audit is running. It takes about a minute.' : 'No audit yet. Run one to see your score.'}</p>
          )}
        </Card>
      </div>

      {latest && (
        <Card title="What to fix first">
          <TopIssuesList issues={latest.topIssues.slice(0, 5)} mode="client" />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Score over time">
          <ScoreTrend points={trend} />
        </Card>
        <Card title="Since your last audit">
          {latest && previous ? <ChangesSinceLast diff={diffReports(previous, latest)} /> : <p className="text-sm text-ink-2">Changes appear after your second audit.</p>}
        </Card>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-bold">Your audits</h2>
        {rows.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
                <p className="min-w-0 flex-1 font-semibold">{day(r.createdAt)}</p>
                {r.score !== null ? (
                  <span className={cn('rounded-pill px-2.5 py-1 text-sm font-bold tabular', scoreTone(r.score))}>{r.score}</span>
                ) : (
                  <span className="text-[13px] font-semibold text-ink-3">{r.status === 'running' ? 'Running' : 'Did not finish'}</span>
                )}
                <Link href={`/my/reports/${r.id}`} className="inline-flex min-h-10 items-center rounded-button border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">
                  {r.status === 'completed' ? 'Open report' : 'View'}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No audits yet.</p>
        )}
      </section>
    </div>
  );
}
