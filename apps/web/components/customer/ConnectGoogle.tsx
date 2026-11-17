import Link from 'next/link';
import type { ReportModel } from '@seo/core';
import { MiniScore } from '@/components/signup/MiniScore';
import type { GoogleStatus } from '@/lib/customer-google';
import { SUPPORT_EMAIL } from '@/lib/site';
import { cn } from '@/lib/tones';

/** Dashboard before Google is connected (design: "Dashboard redesign before Google is connected"). */
const LOCK = 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4';
const LinkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0">
    <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Lock = ({ className }: { className?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className={cn('shrink-0', className)}>
    <path d={LOCK} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Service({ name, detail, unlocks, connected }: { name: string; detail: string; unlocks: string; connected: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border px-4 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', connected ? 'bg-teal' : 'bg-[#CA8A04]')} />
        <div>
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {name}
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', connected ? 'bg-teal-chip text-teal-text' : 'bg-amber-bg text-amber-text')}>{connected ? 'Connected' : 'Not connected'}</span>
          </p>
          <p className="text-[13px] text-ink-2">{detail}</p>
        </div>
      </div>
      <p className="max-w-[260px] text-[13px] text-ink-2">Unlocks: {unlocks}</p>
    </li>
  );
}

export function ConnectGoogleCard({ domain, google }: { domain: string; google: GoogleStatus }) {
  const signedIn = Boolean(google.email);
  const href = signedIn ? `/my/connect?site=${encodeURIComponent(domain)}` : `/api/google/connect?site=${encodeURIComponent(domain)}`;
  const invite = `mailto:?subject=${encodeURIComponent('Please connect our Google accounts to MSScore')}&body=${encodeURIComponent(`Hi,\n\nCould you sign in to MSScore with the Google account that manages Search Console and Analytics for ${domain}? It is read-only.\n\nThanks`)}`;
  return (
    <section aria-labelledby="connect-google" className="flex flex-col gap-5 rounded-[18px] border-2 border-primary bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-[620px]">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary-chip px-2.5 py-1 text-xs font-bold text-primary-heading">Step 1 of setup</span>
            <span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-bold text-ink-2">About 2 minutes</span>
          </div>
          <h2 id="connect-google" className="mt-3 font-display text-[26px] font-bold leading-tight sm:text-[28px]">Connect Google to unlock your dashboard</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            Your weekly plan, rankings and results are built from your real Google data. One sign-in connects Search Console and Analytics.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {google.ready ? (
            <a href={href} className="inline-flex min-h-[52px] items-center gap-2.5 rounded-control bg-primary px-6 text-base font-bold text-primary-ink hover:bg-primary-hover">
              <LinkIcon />
              {signedIn ? 'Choose your properties' : 'Connect with Google'}
            </a>
          ) : (
            <p className="max-w-[260px] text-sm text-ink-2">Connecting Google is not switched on yet. We will let you know when it is ready.</p>
          )}
          <p className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <Lock />
            Read-only. Disconnect any time.
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-2.5">
        <Service name="Google Search Console" detail="Searches, clicks and positions for your site" unlocks="weekly plan, rankings" connected={Boolean(google.site?.gscProperty)} />
        <Service name="Google Analytics 4" detail="Visitors and key events such as calls and forms" unlocks="leads tracked" connected={Boolean(google.site?.ga4Property)} />
      </ul>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-sm text-ink-2">
        <span>
          New website with no Google accounts yet?{' '}
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Help setting up Google for ${domain}`)}`} className="font-semibold text-primary-heading underline">
            Help me set them up
          </a>
        </span>
        <span>
          Someone else manages Google?{' '}
          <a href={invite} className="font-semibold text-primary-heading underline">
            Invite them
          </a>
        </span>
      </div>
    </section>
  );
}

const PREVIEW = ['Clicks from Google', 'Average position', 'Leads tracked', 'Keywords on page 1'];

/** Dashed tiles that show what appears once Google is connected. */
export function LockedTiles() {
  return (
    <section aria-labelledby="after-connect" className="flex flex-col gap-3">
      <h2 id="after-connect" className="text-sm font-semibold text-ink-2">What you will see here after connecting</h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PREVIEW.map((p) => (
          <li key={p} className="rounded-[14px] border border-dashed border-border-strong bg-[#FAF8F4] p-[18px]">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-ink-2">{p}</p>
            <p aria-hidden className="mt-3 h-1 w-6 rounded bg-border-strong" />
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-ink-2">
              <Lock />
              After Google connects
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Available now: your audit": score ring and issue counts from the latest audit. */
export function AuditNowCard({ report, latestId, running }: { report?: ReportModel; latestId: string | null; running: boolean }) {
  const c = report?.severityCounts;
  return (
    <section aria-labelledby="audit-now" className="flex flex-col gap-5 rounded-[18px] border border-border bg-surface p-6">
      <h2 id="audit-now" className="font-display text-xl font-bold">Available now: your audit</h2>
      {report && c ? (
        <>
          <div className="flex flex-wrap items-center gap-6">
            <MiniScore score={report.overall.score} size={96} onLight />
            <div className="grid min-w-[220px] flex-1 grid-cols-2 gap-3">
              <p className="rounded-[12px] bg-fail-bg p-3.5 text-fail-text">
                <span className="block font-display text-2xl font-extrabold tabular">{c.critical}</span>
                <span className="text-sm">Critical</span>
              </p>
              <p className="rounded-[12px] bg-amber-bg p-3.5 text-amber-text">
                <span className="block font-display text-2xl font-extrabold tabular">{c.high}</span>
                <span className="text-sm">High</span>
              </p>
              <p className="col-span-2 rounded-[12px] bg-sunken p-3.5 text-ink-2">
                <span className="block font-display text-2xl font-extrabold text-ink tabular">{c.medium + c.low}</span>
                <span className="text-sm">Medium and low</span>
              </p>
            </div>
          </div>
          {latestId && (
            <Link href={`/my/reports/${latestId}`} className="inline-flex min-h-12 items-center self-start rounded-control border border-border-strong px-5 text-[15px] font-semibold hover:border-ink-3">
              See all {c.critical + c.high + c.medium + c.low} issues
            </Link>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-2">{running ? 'Your first audit is running. It takes about a minute.' : 'No audit yet. Press "Run audit again" to check your site.'}</p>
      )}
    </section>
  );
}

export function LockedPlanCard() {
  return (
    <section aria-labelledby="plan-locked" className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="plan-locked" className="font-display text-xl font-bold">This week&apos;s plan</h2>
        <span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-bold text-ink-2">Locked</span>
      </div>
      <p className="text-[15px] leading-relaxed text-ink-2">
        Every week we pick the five searches closest to page 1 and prepare the fixes for each. The plan starts as soon as Google is connected.
      </p>
    </section>
  );
}
