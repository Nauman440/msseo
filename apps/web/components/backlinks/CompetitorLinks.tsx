import type { AnchorKind, BacklinkAudit } from '@seo/core';
import { cn } from '@/lib/tones';
import { ANCHOR, CARD, pathOf, TD, TH } from './Sections';

/** 6.4.3 Anchor mix, you against each competitor · 6.4.5 the competitors' most linked pages. */
const KINDS: AnchorKind[] = ['brand', 'exact', 'partial', 'generic', 'url', 'empty', 'other'];
// "Your brand" reads as "Their brand" for a competitor.
const label = (k: AnchorKind) => (k === 'brand' ? 'Brand name' : ANCHOR[k]);

export function CompetitorLinkDetails({ a }: { a: BacklinkAudit }) {
  const rivals = a.competitors.filter((c) => c.anchorMix || c.topPages?.length);
  if (!rivals.length) return null;
  const withMix = rivals.filter((c) => c.anchorMix);
  return (
    <section aria-labelledby="cl-title" className={CARD}>
      <h2 id="cl-title" className="font-display text-xl font-bold">How competitors earn their links</h2>
      {withMix.length > 0 && (
        <>
          <p className="text-sm text-ink-2">Share of linking websites by anchor text. Links that use your service words (“exact” and “part of a keyword”) help rankings most, but too many look unnatural.</p>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr>
                  <th className={TH}>Anchor text</th>
                  <th className={cn(TH, 'text-right')}>You</th>
                  {withMix.map((c) => <th key={c.domain} className={cn(TH, 'text-right')}>{c.domain}</th>)}
                </tr>
              </thead>
              <tbody>
                {KINDS.map((k) => (
                  <tr key={k}>
                    <td className={cn(TD, 'font-semibold')}>{label(k)}</td>
                    <td className={cn(TD, 'text-right tabular')}>{a.anchorMix[k]}%</td>
                    {withMix.map((c) => <td key={c.domain} className={cn(TD, 'text-right tabular')}>{c.anchorMix![k]}%</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {rivals.some((c) => c.topPages?.length) && (
        <div className="grid gap-3 md:grid-cols-3">
          {rivals.filter((c) => c.topPages?.length).map((c) => (
            <div key={c.domain} className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-border p-4">
              <p className="font-bold">{c.domain}: most linked pages</p>
              <ul className="flex flex-col gap-1.5 text-sm">
                {c.topPages!.map((p) => (
                  <li key={p.url} className="min-w-0">
                    <a href={p.url} target="_blank" rel="noreferrer" className="break-all font-semibold hover:underline">{pathOf(p.url)}</a>
                    <span className="block text-[12.5px] text-ink-2">{p.domains.toLocaleString('en-US')} linking sites{p.title ? ` · ${p.title}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {rivals.some((c) => c.topPages?.length) && <p className="text-[12.5px] text-ink-3">Pages that earn many links are usually guides, tools, local data or offers. A better version of the same idea is the easiest link to win.</p>}
    </section>
  );
}
