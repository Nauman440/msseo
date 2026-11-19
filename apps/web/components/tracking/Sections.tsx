import { CHANNEL_LABEL, type TrackingAudit } from '@seo/core';
import { CARD, CHIP, pathOf, TD, TH } from '@/components/backlinks/Sections';
import { cn } from '@/lib/tones';

/** 11.2 channels and key events, 11.4 sources, 11.5 leads per page, 11.6 friction (server components). */
const n = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v.toLocaleString('en-US'));

export function ChannelsSection({ a }: { a: TrackingAudit }) {
  const tools = [...new Set(a.pages.flatMap((p) => [...(p.tagManagers ?? []), ...p.callTracking, ...p.chat, ...p.booking, ...p.otherAnalytics, ...(p.metaPixel ? ['Meta pixel'] : []), ...p.googleAds.map((x) => `Google Ads ${x}`)]))];
  return (
    <section aria-labelledby="ch-title" className={CARD}>
      <h2 id="ch-title" className="font-display text-xl font-bold">Ways to get in touch, and whether they are counted</h2>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr><th className={TH}>Way in</th><th className={TH}>On the site</th><th className={TH}>Counted in GA4 as</th><th className={cn(TH, 'text-right')}>Last 28 days</th></tr></thead>
          <tbody>
            {a.channels.map((c) => (
              <tr key={c.channel}>
                <td className={cn(TD, 'font-semibold')}>{CHANNEL_LABEL[c.channel]}</td>
                <td className={TD}>{c.onSite ? `Yes · ${c.pages} of ${a.pages.length} pages` : <span className="text-ink-2">Not found</span>}</td>
                <td className={TD}>
                  {c.keyEvents.length ? c.keyEvents.join(', ') : c.onSite && a.connections.ga4 ? <span className={cn(CHIP, 'bg-warn-bg text-warn-text')}>Not counted</span> : <span className="text-ink-2">–</span>}
                </td>
                <td className={cn(TD, 'text-right tabular')}>{n(c.count28)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.keyEvents.some((k) => !k.channel) && <p className="text-[13px] text-ink-2">Other key events: {a.keyEvents.filter((k) => !k.channel).map((k) => `${k.eventName} (${k.count28})`).join(', ')}.</p>}
      {tools.length > 0 && <p className="text-[13px] text-ink-2"><b className="text-ink">Tools found on the site:</b> {tools.join(', ')}.</p>}
    </section>
  );
}

export function SourcesSection({ a }: { a: TrackingAudit }) {
  const s = a.sources;
  if (!s) return null;
  return (
    <section aria-labelledby="src-title" className={CARD}>
      <h2 id="src-title" className="font-display text-xl font-bold">Where visits come from (last 28 days)</h2>
      <ul className="flex flex-col gap-2">
        {s.groups.slice(0, 8).map((g) => (
          <li key={g.name} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-3 text-sm">
            <span className="truncate font-semibold">{g.name}</span>
            <span className="h-2 overflow-hidden rounded-bar bg-sunken"><span className={cn('block h-full', /unassigned|not set/i.test(g.name) ? 'bg-chart-fail' : 'bg-chart-primary')} style={{ width: `${Math.max(2, g.share)}%` }} /></span>
            <span className="text-right tabular text-ink-2">{g.share}%</span>
          </li>
        ))}
      </ul>
      {(s.selfReferrals.length > 0 || s.gateways.length > 0) && (
        <p className="text-[13px] text-ink-2">
          {s.selfReferrals.length > 0 && <>Your own site shows up as a referrer ({s.selfReferrals.map((x) => x.source).join(', ')}). </>}
          {s.gateways.length > 0 && <>Payment sites show up as referrers ({s.gateways.map((x) => x.source).join(', ')}), which steals credit from the real source.</>}
        </p>
      )}
    </section>
  );
}

export function LeadPagesSection({ a }: { a: TrackingAudit }) {
  if (!a.leadPages.length) return null;
  return (
    <section aria-labelledby="lp-title" className={CARD}>
      <h2 id="lp-title" className="font-display text-xl font-bold">Leads per landing page (last 90 days)</h2>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead><tr><th className={TH}>Page</th><th className={cn(TH, 'text-right')}>Visits</th><th className={cn(TH, 'text-right')}>Leads</th><th className={cn(TH, 'text-right')}>Rate</th></tr></thead>
          <tbody>
            {a.leadPages.map((p) => (
              <tr key={p.path}>
                <td className={cn(TD, 'break-all font-semibold')}>{p.path}</td>
                <td className={cn(TD, 'text-right tabular')}>{n(p.sessions)}</td>
                <td className={cn(TD, 'text-right tabular', p.leads === 0 && p.sessions >= 50 && 'font-bold text-high-strong')}>{n(p.leads)}</td>
                <td className={cn(TD, 'text-right tabular')}>{p.rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function FrictionSection({ a }: { a: TrackingAudit }) {
  if (!a.friction.length) return null;
  return (
    <section aria-labelledby="fr-title" className={CARD}>
      <h2 id="fr-title" className="font-display text-xl font-bold">How easy it is to get in touch, page by page</h2>
      <ul className="flex flex-col">
        {a.friction.map((f) => (
          <li key={f.url} className="flex flex-col gap-1 border-t border-border py-3 text-sm first:border-t-0">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <a href={f.url} target="_blank" rel="noreferrer" className="break-all font-semibold hover:underline">{pathOf(f.url)}</a>
              <span className="flex flex-wrap gap-1.5 text-[12px]">
                <span className={cn(CHIP, f.callLink ? 'bg-teal-chip text-teal-text' : 'bg-sunken text-ink-2')}>{f.callLink ? 'Call button' : 'No call button'}</span>
                {f.formFields !== null && <span className={cn(CHIP, f.formFields > 5 ? 'bg-warn-bg text-warn-text' : 'bg-teal-chip text-teal-text')}>Form: {f.formFields} {f.formFields === 1 ? 'field' : 'fields'}</span>}
                {f.mobileScore !== null && <span className={cn(CHIP, f.mobileScore < 50 ? 'bg-high-bg text-high-strong' : 'bg-sunken text-ink-2')}>Mobile speed {f.mobileScore}</span>}
              </span>
            </span>
            {f.issues.length > 0 && <span className="text-ink-2">{f.issues.join(' · ')}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
