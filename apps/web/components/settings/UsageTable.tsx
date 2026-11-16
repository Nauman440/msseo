/** Monthly API usage per provider (spec §14 cost controls). */
export type UsageMonth = { label: string; audits: number; rows: { provider: string; endpoint: string; units: number; costUsd: number | null }[] };

const NAMES: Record<string, string> = {
  dataforseo: 'DataForSEO',
  pagespeed: 'PageSpeed Insights',
  gsc: 'Search Console (analytics, sitemaps)',
  'gsc-inspect': 'Search Console (URL Inspection)',
  openai: 'OpenAI',
};
const ORDER = Object.keys(NAMES);
const n = (v: number) => v.toLocaleString('en-US');

export function UsageTable({ months }: { months: UsageMonth[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {months.map((m) => {
        const rows = [...m.rows].sort((a, b) => ORDER.indexOf(a.provider) - ORDER.indexOf(b.provider) || a.endpoint.localeCompare(b.endpoint));
        const dollars = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
        return (
          <section key={m.label} className="rounded-panel border border-border bg-surface p-5">
            <h3 className="font-display text-base font-bold">{m.label}</h3>
            <p className="mt-1 text-[13px] text-ink-3 tabular">
              {n(m.audits)} {m.audits === 1 ? 'audit' : 'audits'} · DataForSEO ${dollars.toFixed(2)}
            </p>
            {rows.length ? (
              <table className="mt-3 w-full text-left text-[13px]">
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.provider}-${r.endpoint}`} className="border-t border-border">
                      <td className="py-2 pr-3">{NAMES[r.provider] ?? r.provider}</td>
                      <td className="py-2 text-right tabular">
                        {n(r.units)} {r.endpoint === 'tokens' ? 'tokens' : 'calls'}
                        {r.costUsd !== null && <span className="block text-ink-3">${r.costUsd.toFixed(2)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-3 text-sm text-ink-3">No API usage recorded.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
