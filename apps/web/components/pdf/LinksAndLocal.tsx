import type { BacklinkAudit, LocalAudit } from '@seo/core';

/** Modules 8 and 9 in the PDF: the key numbers and the next steps (print layout: no md:/lg: classes). */
const n = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v.toLocaleString('en-US'));

function Tiles({ items }: { items: { label: string; value: string }[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2">
      {items.map((t) => (
        <li key={t.label} className="rounded-[10px] border border-border px-3 py-2">
          <p className="font-display text-[16px] font-extrabold tabular">{t.value}</p>
          <p className="text-[10px] text-ink-2">{t.label}</p>
        </li>
      ))}
    </ul>
  );
}

export function LinksAndLocal({ links, local }: { links: BacklinkAudit | null; local: LocalAudit | null }) {
  if (!links && !local) return null;
  const cells = local?.grid ? local.grid.size * local.grid.size * local.grid.searches.length : 0;
  const top3 = local?.grid ? local.grid.searches.reduce((x, s) => x + s.top3, 0) : 0;
  return (
    <div className="flex flex-col gap-4">
      {links && (
        <div className="pdf-avoid flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-bold">Links from other websites</h2>
          <Tiles items={[
            { label: 'Linking websites', value: n(links.summary.referringDomains) },
            { label: 'Spammy links', value: n(links.quality.toxic) },
            { label: 'Broken backlinks', value: n(links.broken.length) },
          ]} />
          {links.gap.length > 0 && <p className="text-[11px] text-ink-2"><strong className="text-ink">Where to get links:</strong> {links.gap.slice(0, 6).map((g) => g.domain).join(', ')}{links.gap.length > 6 ? ` and ${links.gap.length - 6} more` : ''}.</p>}
          {links.broken.length > 0 && <p className="text-[11px] text-ink-2"><strong className="text-ink">Fix first:</strong> redirect {links.broken.length} broken {links.broken.length === 1 ? 'page' : 'pages'} that other websites link to.</p>}
        </div>
      )}
      {local && (
        <div className="pdf-avoid flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-bold">Local search and Google Business Profile</h2>
          <Tiles items={[
            { label: 'Profile complete', value: local.completeness ? `${local.completeness.score}%` : '–' },
            { label: 'Google rating', value: local.reviews?.rating ? `${local.reviews.rating.toFixed(1)} (${n(local.reviews.total)})` : '–' },
            { label: 'In the map pack', value: cells ? `${Math.round((top3 / cells) * 100)}% of the area` : '–' },
          ]} />
          {local.completeness && local.completeness.checks.some((c) => !c.ok) && (
            <p className="text-[11px] text-ink-2"><strong className="text-ink">Complete your profile:</strong> {local.completeness.checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join(', ')}.</p>
          )}
          <p className="text-[11px] text-ink-2"><strong className="text-ink">Directories:</strong> listed on {local.citations.filter((c) => c.found).map((c) => c.label).join(', ') || 'none found'}; missing {local.citations.filter((c) => !c.found).map((c) => c.label).join(', ') || 'none'}.</p>
        </div>
      )}
    </div>
  );
}
