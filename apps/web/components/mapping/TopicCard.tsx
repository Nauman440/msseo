import Link from 'next/link';
import type { MappingRow } from '@seo/core';
import { cn } from '@/lib/tones';
import { Arrow, BUTTON_PRIMARY, ConflictForm, PageChooser } from './forms';
import { CHIP, MATCH, matchWhy, MONO, positionChip } from './labels';

/** One topic on the page mapping overview (design: Keywords tab page mapping): conflict, new page or mapped. */
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

function TopicSide({ row, supporting }: { row: MappingRow; supporting: number }) {
  return (
    <div className="flex min-w-[min(220px,100%)] flex-1 flex-col gap-1.5">
      <h3 className="text-base font-bold">{row.topic}</h3>
      <p className="text-[13px]">
        <span className="text-ink-2">Main keyword:</span> <strong>{row.primaryKeyword}</strong>
        {row.volume > 0 && <> · {row.volume.toLocaleString('en-US')}/mo</>}
      </p>
      {supporting > 0 && <p className="text-[12px] text-ink-2">+{supporting} supporting {supporting === 1 ? 'keyword' : 'keywords'}</p>}
    </div>
  );
}

export function TopicCard({ domain, row, supporting, fixes, pages, pageHref, positions }: {
  domain: string;
  row: MappingRow;
  supporting: number;
  fixes: number;
  pages: string[];
  pageHref: string;
  positions: Record<string, number | null>;
}) {
  const conflict = row.url && row.conflicts.length > 0 && !row.conflictSettled;
  const side = <TopicSide row={row} supporting={supporting} />;

  if (conflict) {
    return (
      <article aria-label={row.topic} className="rounded-card border-2 border-high-line bg-surface px-5 py-[18px]">
        <ConflictForm domain={domain} row={row} left={side} positions={positions} />
      </article>
    );
  }

  if (!row.url) {
    return (
      <article aria-label={row.topic} className="flex flex-col gap-3.5 rounded-card border border-border bg-surface px-5 py-[18px]">
        <div className="flex flex-wrap items-center gap-4">
          {side}
          <Arrow />
          <div className="flex min-w-[min(240px,100%)] flex-[1.2] flex-col gap-1.5 rounded-[12px] border border-dashed border-border-strong bg-canvas p-3">
            <p className="text-[12px] font-bold text-ink-2">No page covers this yet. Suggested:</p>
            <p className={MONO}>{row.suggestedPath}</p>
            <p className="text-[12.5px] text-ink-2">{row.newPageNote}</p>
          </div>
          <span className={`${CHIP} bg-primary-chip text-primary-heading`}>New page needed</span>
        </div>
        {/also targets|closest page/.test(row.reason) && <p className="text-[13px] text-ink-2">{row.reason}.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border pt-3">
          <p className="text-[13px] text-ink-2">{row.sentAt ? 'Sent to approvals' : 'Publishing a new page always needs your approval'}</p>
          <div className="flex flex-wrap gap-2">
            <PageChooser domain={domain} row={row} pages={pages} label="Use an existing page" />
            <Link href={pageHref} className={BUTTON_PRIMARY}>Create page brief</Link>
          </div>
        </div>
      </article>
    );
  }

  const m = row.match ? MATCH[row.match] : MATCH.medium;
  const shared = /also targets/.test(row.reason);
  return (
    <article aria-label={row.topic} className="flex flex-col gap-3.5 rounded-card border border-border bg-surface px-5 py-[18px]">
      <div className="flex flex-wrap items-center gap-4">
        {side}
        <Arrow />
        <div className="flex min-w-[min(240px,100%)] flex-[1.2] flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={MONO}>{path(row.url)}</span>
            <span className={`${CHIP} ${positionChip(row.currentPosition)}`}>{row.currentPosition !== null ? `#${Math.round(row.currentPosition)}` : 'Not ranking'}</span>
          </div>
          <div className="flex items-end gap-2">
            <span aria-hidden="true" className="flex items-end gap-0.5">
              {['h-2', 'h-3', 'h-4'].map((h, i) => (
                <span key={h} className={cn('w-1.5 rounded-[2px]', h, i < m.bars ? m.tone : 'bg-border')} />
              ))}
            </span>
            <span>
              <span className="block text-[12.5px] font-bold">{m.label}</span>
              <span className="block text-[12px] text-ink-2">{matchWhy(row)}</span>
            </span>
          </div>
          {row.conflictSettled && <p className="text-[12px] text-ink-2">Main page confirmed{row.conflictPlan === 'merge' ? ': the other page will be merged' : ': the other page gets a different keyword'}</p>}
          {shared && <p className="text-[12px] font-semibold text-amber-text">{row.reason.split('. ').pop()}</p>}
        </div>
        <span className={`${CHIP} bg-teal-chip text-teal-text`}>{row.action === 'leave' ? 'In the top 3' : 'Mapped'}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border pt-3">
        <p className="text-[13px] text-ink-2">
          {fixes > 0 ? `${fixes} ${fixes === 1 ? 'fix' : 'fixes'} drafted for this page` : row.pageCheck ? 'Every keyword is in place' : 'Open the page to check where its keywords are'}
          {row.sentAt ? ' · sent to approvals' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <PageChooser domain={domain} row={row} pages={pages} label="Change page" />
          <Link href={pageHref} className={BUTTON_PRIMARY}>Review fixes</Link>
        </div>
      </div>
    </article>
  );
}
