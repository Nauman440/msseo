import type { CheckStatus, TrackingWorkspace } from '@seo/core';
import { CARD, CHIP } from '@/components/backlinks/Sections';
import { cn } from '@/lib/tones';
import { LeadQualityForm, RunTracking } from './forms';
import { ChannelsSection, FrictionSection, LeadPagesSection, SourcesSection } from './Sections';

/** Module 11 · Tracking and conversions page body, the same for the team and customers. */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';
export const STATUS: Record<CheckStatus, { label: string; tone: string }> = {
  pass: { label: 'OK', tone: 'bg-teal-chip text-teal-text' },
  warn: { label: 'Check', tone: 'bg-warn-bg text-warn-text' },
  fail: { label: 'Fix', tone: 'bg-high-bg text-high-strong' },
  info: { label: 'Info', tone: 'bg-sunken text-ink-2' },
};

export function TrackingView({ ws, audience, connectHref }: { ws: TrackingWorkspace; audience: 'team' | 'customer'; connectHref: string }) {
  const a = ws.audit;
  const missingGoogle = a && (!a.connections.gsc || !a.connections.ga4);
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-5 py-[18px]">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={EYEBROW}>{a ? `Last check · ${day(a.runAt)}` : 'Not checked yet'}</p>
          <p className="text-[15px] font-semibold">Are calls, forms and bookings from the website counted, so you can see what SEO brings in?</p>
          <p className="text-[13px] text-ink-2">Free: reads the site’s tags{audience === 'customer' ? ' and your Google connection' : ', Search Console and GA4 (customer connection)'}.</p>
        </div>
        <RunTracking domain={ws.domain} again={Boolean(a)} />
      </div>
      {missingGoogle && (
        <p className="rounded-[14px] border border-border bg-warn-bg px-[18px] py-3.5 text-sm text-warn-text">
          {audience === 'customer' ? (
            <>Connect Google to check that Search Console and Analytics count your leads. <a href={connectHref} className="font-bold underline">Connect Google</a></>
          ) : (
            'GA4 is read through the customer’s own Google connection; without it the lead checks are limited to what is on the site.'
          )}
        </p>
      )}
      {a && (
        <>
          {a.notes.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm text-ink-2">
              {a.notes.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          <section aria-labelledby="checks-title" className={CARD}>
            <h2 id="checks-title" className="font-display text-xl font-bold">What to fix first</h2>
            <ul className="flex flex-col">
              {a.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-3 border-t border-border py-3 text-sm first:border-t-0">
                  <span className={cn(CHIP, 'mt-0.5', STATUS[c.status].tone)}>{STATUS[c.status].label}</span>
                  <span className="min-w-0">
                    <b>{c.label}</b>
                    {audience === 'team' && <span className="ml-2 text-[12px] text-ink-3">{c.point}</span>}
                    <span className="block text-ink-2">{c.detail}</span>
                    {c.fix && <span className="mt-1 block text-[13px]"><b>Fix:</b> {c.fix}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <ChannelsSection a={a} />
          <SourcesSection a={a} />
          <LeadPagesSection a={a} />
          <FrictionSection a={a} />
        </>
      )}
      <section aria-labelledby="quality-title" className={CARD}>
        <h2 id="quality-title" className="font-display text-xl font-bold">Lead quality</h2>
        <p className="text-sm text-ink-2">Counting leads is half the story: what matters is how many become paying jobs. This part is filled in by hand.</p>
        <LeadQualityForm domain={ws.domain} manual={ws.manual} />
      </section>
    </div>
  );
}
