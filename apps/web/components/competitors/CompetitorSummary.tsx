import type { CompetitorWorkspace } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { Sparkline } from './Sparkline';

/** Report section (Module 3): the shortlisted competitors with strength and trend. */
export function CompetitorSummary({ ws, href }: { ws: CompetitorWorkspace; href?: string }) {
  const list = ws.competitors.filter((c) => c.shortlist !== 'none');
  if (!list.length) return null;
  const n = (v: number | null) => (v === null ? '–' : Math.round(v).toLocaleString('en-US'));
  return (
    <Card title="Competitors" eyebrow="Your shortlist" badge={href ? <a href={href} className="text-sm font-semibold text-primary-text hover:underline">Manage</a> : undefined}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-ink-3">
              <th className="py-2 pr-3 font-semibold">Website</th>
              <th className="py-2 pr-3 font-semibold">Role</th>
              <th className="py-2 pr-3 font-semibold">Visits / month</th>
              <th className="py-2 pr-3 font-semibold">Keywords</th>
              <th className="py-2 font-semibold">12 months</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.domain} className="border-b border-border last:border-0">
                <td className="py-2.5 pr-3 font-semibold">{c.domain}</td>
                <td className="py-2.5 pr-3 text-ink-2">{c.shortlist === 'direct' ? 'Direct' : 'Aspirational'}</td>
                <td className="py-2.5 pr-3 tabular">{n(c.etv)}</td>
                <td className="py-2.5 pr-3 tabular">{n(c.keywords)}</td>
                <td className="py-2.5"><Sparkline points={c.trend} label={c.domain} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
