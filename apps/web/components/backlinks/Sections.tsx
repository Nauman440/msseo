import type { AnchorKind, BacklinkAudit, LinkType, Quality } from '@seo/core';
import { cn } from '@/lib/tones';

/** Module 8 sections on the Backlinks page (server components). */
export const CARD = 'flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-6';
export const TH = 'whitespace-nowrap px-2.5 py-2 text-left text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2';
export const TD = 'border-t border-border px-2.5 py-2.5 align-top';
export const CHIP = 'whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-bold';
const n = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v.toLocaleString('en-US'));
export const pathOf = (u: string) => {
  try {
    const p = new URL(u);
    return `${p.hostname.replace(/^www\./, '')}${p.pathname}`;
  } catch {
    return u;
  }
};

export const QUALITY: Record<Quality, { label: string; tone: string; bar: string }> = {
  strong: { label: 'Strong', tone: 'bg-teal-chip text-teal-text', bar: 'bg-teal' },
  good: { label: 'Good', tone: 'bg-indigo-bg text-indigo-text', bar: 'bg-chart-primary' },
  weak: { label: 'Weak', tone: 'bg-sunken text-ink-2', bar: 'bg-chart-neutral' },
  toxic: { label: 'Toxic', tone: 'bg-high-bg text-high-strong', bar: 'bg-chart-fail' },
};
export const LINK_TYPE: Record<LinkType, string> = { directory: 'Directory', news: 'News', association: 'Association', education: 'Education', government: 'Government', social: 'Social', blog: 'Blog', business: 'Business', other: 'Other' };
export const ANCHOR: Record<AnchorKind, string> = { brand: 'Your brand', exact: 'Exact keyword', partial: 'Part of a keyword', generic: 'Generic ("click here")', url: 'Web address', empty: 'No text (images)', other: 'Other' };

/** 6.4.1 / 6.4.2 You against the direct competitors. */
export function VersusCompetitors({ a }: { a: BacklinkAudit }) {
  if (!a.competitors.length) return null;
  const rows = [
    { domain: `You · ${a.domain}`, rank: a.summary.rank, domains: a.summary.referringDomains, links: a.summary.backlinks, spam: a.summary.spamScore, recent: a.series.filter((s) => Date.parse(s.date) > Date.parse(a.runAt) - 90 * 86_400_000).reduce((x, y) => x + y.newDomains, 0), you: true },
    ...a.competitors.map((c) => ({ domain: c.domain, rank: c.rank, domains: c.referringDomains, links: c.backlinks, spam: c.spamScore, recent: c.newDomains90, you: false })),
  ];
  return (
    <section aria-labelledby="vs-title" className={CARD}>
      <h2 id="vs-title" className="font-display text-xl font-bold">You vs your direct competitors</h2>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead><tr><th className={TH}>Website</th><th className={cn(TH, 'text-right')}>Linking sites</th><th className={cn(TH, 'text-right')}>New in 90 days</th><th className={cn(TH, 'text-right')}>Backlinks</th><th className={cn(TH, 'text-right')}>Strength (0–100)</th><th className={cn(TH, 'text-right')}>Spam score</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.domain} className={cn(r.you && 'bg-primary-wash')}>
                <td className={cn(TD, 'break-all font-semibold')}>{r.domain}</td>
                <td className={cn(TD, 'text-right tabular')}>{n(r.domains)}</td>
                <td className={cn(TD, 'text-right tabular')}>{n(r.recent)}</td>
                <td className={cn(TD, 'text-right tabular')}>{n(r.links)}</td>
                <td className={cn(TD, 'text-right tabular')}>{n(r.rank)}</td>
                <td className={cn(TD, 'text-right tabular')}>{n(r.spam)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** 8.2 Quality and relevance, 8.3 toxic links and spikes. */
export function QualitySection({ a, csvHref }: { a: BacklinkAudit; csvHref: string }) {
  const total = a.domains.length || 1;
  const toxic = a.domains.filter((d) => d.quality === 'toxic');
  const relevant = a.domains.filter((d) => d.relevant).length;
  const local = a.domains.filter((d) => d.local).length;
  return (
    <section aria-labelledby="quality-title" className={CARD}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="quality-title" className="font-display text-xl font-bold">Link quality</h2>
          <p className="mt-1 text-sm text-ink-2">The {a.domains.length} strongest websites linking to you, by strength and spam score. {relevant} look related to your business, {local} are local.</p>
        </div>
        {a.domains.length > 0 && <a href={csvHref} className="inline-flex min-h-10 items-center rounded-control border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">Download CSV</a>}
      </div>
      <div className="flex h-3 overflow-hidden rounded-[3px] bg-border" aria-hidden>
        {(['strong', 'good', 'weak', 'toxic'] as Quality[]).map((q) => <span key={q} className={QUALITY[q].bar} style={{ width: `${(a.quality[q] / total) * 100}%` }} />)}
      </div>
      <ul className="flex flex-wrap gap-2 text-[13px]">
        {(['strong', 'good', 'weak', 'toxic'] as Quality[]).map((q) => <li key={q} className={cn(CHIP, QUALITY[q].tone)}>{QUALITY[q].label} · {a.quality[q]}</li>)}
      </ul>
      {toxic.length > 0 && (
        <div className="rounded-[12px] border border-high-line bg-warn-bg px-4 py-3 text-sm">
          <p className="font-bold text-high-strong">{toxic.length} spammy {toxic.length === 1 ? 'website links' : 'websites link'} to you</p>
          <p className="mt-1 text-ink-2">{toxic.slice(0, 8).map((d) => d.domain).join(', ')}. If you did not ask for these links and they look like spam, list them in a disavow file in Google Search Console.</p>
        </div>
      )}
      {a.spikes.length > 0 && (
        <p className="text-sm text-ink-2"><strong className="text-ink">Sudden jumps:</strong> {a.spikes.map((s) => `${s.newDomains} new linking sites in the week of ${s.date}`).join('; ')}. A jump you did not cause can mean spam links.</p>
      )}
      <div className="relative max-h-[420px] overflow-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="sticky top-0 bg-surface"><tr><th className={TH}>Website</th><th className={TH}>Quality</th><th className={TH}>Type</th><th className={cn(TH, 'text-right')}>Strength</th><th className={cn(TH, 'text-right')}>Links</th></tr></thead>
          <tbody>
            {a.domains.slice(0, 40).map((d) => (
              <tr key={d.domain}>
                <td className={cn(TD, 'break-all font-semibold')}>{d.domain}{d.relevant && <span className={cn(CHIP, 'ml-1.5 bg-teal-chip text-teal-text')}>Related</span>}{d.local && <span className={cn(CHIP, 'ml-1.5 bg-primary-chip text-primary-heading')}>Local</span>}</td>
                <td className={TD}><span className={cn(CHIP, QUALITY[d.quality].tone)}>{QUALITY[d.quality].label}</span></td>
                <td className={cn(TD, 'text-ink-2')}>{LINK_TYPE[d.type]}</td>
                <td className={cn(TD, 'text-right tabular')}>{n(d.rank)}</td>
                <td className={cn(TD, 'text-right tabular')}>{n(d.backlinks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** 8.4 Anchor text mix. */
export function AnchorSection({ a }: { a: BacklinkAudit }) {
  if (!a.anchors.length) return null;
  const kinds = (Object.keys(a.anchorMix) as AnchorKind[]).filter((k) => a.anchorMix[k] > 0).sort((x, y) => a.anchorMix[y] - a.anchorMix[x]);
  return (
    <section aria-labelledby="anchor-title" className={CARD}>
      <div>
        <h2 id="anchor-title" className="font-display text-xl font-bold">The words other sites use to link to you</h2>
        <p className="mt-1 text-sm text-ink-2">A natural mix is mostly your brand and web address. Many exact-keyword links can look paid for.</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {kinds.map((k) => (
          <li key={k} className="grid grid-cols-[170px_1fr_48px] items-center gap-3 text-sm">
            <span className="text-ink-2">{ANCHOR[k]}</span>
            <span className="h-2.5 overflow-hidden rounded-[3px] bg-border"><span className={cn('block h-full', k === 'exact' && a.anchorMix[k] > 20 ? 'bg-chart-high' : 'bg-chart-primary')} style={{ width: `${a.anchorMix[k]}%` }} /></span>
            <span className="text-right tabular">{a.anchorMix[k]}%</span>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-ink-2">Most used: {a.anchors.slice(0, 8).map((x) => `“${x.anchor || '(no text)'}” (${x.domains})`).join(', ')}</p>
    </section>
  );
}

/** 8.8 Pages with the most links. */
export function TopLinkedPages({ a }: { a: BacklinkAudit }) {
  if (!a.topPages.length) return null;
  return (
    <section aria-labelledby="pages-title" className={CARD}>
      <h2 id="pages-title" className="font-display text-xl font-bold">Your most linked pages</h2>
      <ol className="flex flex-col gap-1.5 text-sm">
        {a.topPages.slice(0, 10).map((p) => (
          <li key={p.url} className="flex flex-wrap justify-between gap-2 border-t border-border pt-1.5">
            <span className="min-w-0 break-all font-mono text-[12.5px]">{pathOf(p.url)}{p.status && p.status >= 400 ? <span className={cn(CHIP, 'ml-2 bg-high-bg text-high-strong')}>{p.status}</span> : null}</span>
            <span className="text-ink-2 tabular">{n(p.domains)} sites · {n(p.backlinks)} links</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
