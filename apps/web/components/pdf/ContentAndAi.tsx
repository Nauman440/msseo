import { ASSISTANT_LABEL, type AeoAudit, type Assistant, type ContentAudit } from '@seo/core';

/** Modules 7 and 10 in the PDF: key numbers and next steps (print layout: no md:/lg: classes). */
function Tiles({ items }: { items: { label: string; value: string }[] }) {
  return (
    <ul className="grid grid-cols-4 gap-2">
      {items.map((t) => (
        <li key={t.label} className="rounded-[10px] border border-border px-3 py-2">
          <p className="font-display text-[16px] font-extrabold tabular">{t.value}</p>
          <p className="text-[10px] text-ink-2">{t.label}</p>
        </li>
      ))}
    </ul>
  );
}
const pathOf = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

export function ContentAndAi({ content, aeo }: { content: ContentAudit | null; aeo: AeoAudit | null }) {
  if (!content && !aeo) return null;
  const you = aeo?.share.all.find((s) => s.you);
  const rivals = aeo?.share.all.filter((s) => !s.you && s.mentions > 0).slice(0, 4) ?? [];
  return (
    <div className="flex flex-col gap-4">
      {content && (
        <div className="pdf-avoid flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-bold">Your content</h2>
          <Tiles items={[
            { label: 'Keep', value: String(content.counts.keep) },
            { label: 'Improve', value: String(content.counts.improve) },
            { label: 'Merge', value: String(content.counts.merge) },
            { label: 'Remove', value: String(content.counts.remove) },
          ]} />
          {content.decay.length > 0 && <p className="text-[11px] text-ink-2"><strong className="text-ink">Losing visits:</strong> {content.decay.slice(0, 5).map((r) => pathOf(r.url)).join(', ')}.</p>}
          {content.topicGap.length > 0 && <p className="text-[11px] text-ink-2"><strong className="text-ink">Topics to add:</strong> {content.topicGap.slice(0, 6).map((g) => g.topic).join(', ')}.</p>}
          {content.calendar.length > 0 && <p className="text-[11px] text-ink-2"><strong className="text-ink">Write next:</strong> {content.calendar.slice(0, 4).map((c) => c.topic).join(', ')}.</p>}
        </div>
      )}
      {aeo && (
        <div className="pdf-avoid flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-bold">AI search (ChatGPT, Perplexity, Google AI)</h2>
          <Tiles items={[
            { label: 'Share of voice', value: `${you?.share ?? 0}%` },
            ...(['chatgpt', 'perplexity', 'google'] as Assistant[]).map((x) => ({ label: ASSISTANT_LABEL[x], value: `${aeo.share[x].find((s) => s.you)?.share ?? 0}%` })),
          ]} />
          {rivals.length > 0 && <p className="text-[11px] text-ink-2"><strong className="text-ink">Named instead of you:</strong> {rivals.map((r) => `${r.domain} (${r.mentions})`).join(', ')}.</p>}
          {aeo.sources.length > 0 && <p className="text-[11px] text-ink-2"><strong className="text-ink">Sites AI cites:</strong> {aeo.sources.slice(0, 8).map((s) => s.domain).join(', ')}.</p>}
          {aeo.crawlers.some((c) => !c.allowed) && <p className="text-[11px] text-ink-2"><strong className="text-ink">Blocked AI crawlers:</strong> {aeo.crawlers.filter((c) => !c.allowed).map((c) => c.label).join(', ')}.</p>}
        </div>
      )}
    </div>
  );
}
