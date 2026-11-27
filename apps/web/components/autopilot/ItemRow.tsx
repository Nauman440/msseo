import type { WorkItem } from '@seo/core';
import { resultText } from './AutopilotSchedule';
import { ApproveButton, RedoItemButton, UndoItemButton } from './forms';

/** One website change: what it was, what it is now (or the draft for a person), and its result. */
export const INTERNAL: Record<string, string> = { gsc_sitemap_submit: 'MS SCORE submits it to Search Console after each run', ai_visibility_check: 'MS SCORE checks AI assistants', weekly_page_check: 'MS SCORE checks every week' };

function valueText(i: WorkItem): string | null {
  const v = i.newValue as Record<string, unknown> | string | null;
  if (typeof v === 'string') return v;
  if (!v) return null;
  if (typeof v.alt === 'string') return `Alt text: ${v.alt}`;
  if (typeof v.html === 'string') return v.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (Array.isArray(v.faq)) return (v.faq as { q: string; a: string }[]).map((f) => `${f.q} ${f.a}`).join(' · ');
  if (typeof v.to === 'string') return `→ ${v.to}`;
  if (v.action === 'demote_extra_h1') return 'Turn the extra H1 headings into H2s';
  if (v.action === 'add_h1') return `Add the H1 “${String(v.text)}”`;
  if (typeof v.slug === 'string') return `New page “${String(v.title)}” (saved as a draft)`;
  if (typeof v.title === 'string') return `Sharing title: ${v.title}`;
  if (v.json) return 'Structured data (JSON-LD)';
  return null;
}

export function ItemRow({ i, domain, undo, approve }: { i: WorkItem; domain: string; undo?: boolean; approve?: boolean }) {
  const before = typeof i.before === 'string' ? i.before : null;
  const value = valueText(i);
  const result = resultText(i);
  return (
    <li className="flex flex-col gap-1 px-5 py-3 text-[14px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{i.label}</span>
        {undo && <UndoItemButton domain={domain} id={i.id} />}
        {i.status === 'rolled_back' && <RedoItemButton domain={domain} id={i.id} />}
        {approve && !i.approvedAt && <ApproveButton domain={domain} ids={[i.id]} label="Approve" />}
        {approve && i.approvedAt && <span className="text-[13px] font-semibold text-pass-text">Approved</span>}
      </div>
      {before && value && i.status !== 'keep' && <p className="text-ink-2"><span className="font-semibold">Before:</span> {before}</p>}
      {value && i.status !== 'keep' && <p><span className="font-semibold">{i.status === 'needs_human' ? 'Drafted:' : 'Now:'}</span> {value}</p>}
      {i.status === 'keep' && before && <p className="text-ink-2">{before}</p>}
      {i.reason && <p className="text-[13px] text-ink-2">{i.reason}</p>}
      {result && <p className="text-[13px] font-semibold text-ink-2">{result}</p>}
    </li>
  );
}

