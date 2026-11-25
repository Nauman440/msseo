import Link from 'next/link';
import type { CardKeyword, MappingRow, PageCard } from '@seo/core';
import { cn } from '@/lib/tones';
import { CHIP } from './labels';

/**
 * One page of the simple page plan (design: Keywords → Page plan, simple view): the search the page
 * wins (primary keyword), the secondary keywords it also targets (title and headings), the informational
 * searches it answers (questions and research, for the text and FAQ), and the changes ready to review. New pages are dashed and offer "Draft this page".
 */

/** Monthly searches in plain words, with 1–3 bars. */
export function volumeWord(v: number | null): { word: string; bars: number } {
  if (v !== null && v >= 500) return { word: 'Lots', bars: 3 };
  if (v !== null && v >= 50) return { word: 'Some', bars: 2 };
  return { word: 'A few', bars: 1 };
}

export function Volume({ volume }: { volume: number | null }) {
  const { word, bars } = volumeWord(volume);
  const exact = volume ? `${volume.toLocaleString('en-US')} searches a month` : 'Fewer than 10 searches a month';
  return (
    <span title={exact} className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-ink-2">
      <span aria-hidden="true" className="flex items-end gap-0.5">
        {['h-1.5', 'h-2.5', 'h-3.5'].map((h, i) => (
          <span key={h} className={cn('w-1.5 rounded-[2px]', h, i < bars ? 'bg-teal' : 'bg-border')} />
        ))}
      </span>
      {word}
      <span className="sr-only"> ({exact})</span>
    </span>
  );
}

const EYEBROW = 'text-[11px] font-extrabold uppercase tracking-[0.07em] text-ink-2';
const MORE = 4;

export function KeywordList({ title, hint, items }: { title: string; hint: string; items: CardKeyword[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col">
      <p className={EYEBROW}>
        {title} <span className="font-semibold normal-case tracking-normal">· {hint}</span>
      </p>
      <ul className="mt-1.5 divide-y divide-border border-t border-border">
        {items.slice(0, MORE).map((k) => (
          <li key={k.term} className="flex items-center justify-between gap-3 py-1.5 text-[13.5px]">
            <span className="min-w-0 break-words">{k.term}</span>
            <Volume volume={k.volume} />
          </li>
        ))}
      </ul>
      {items.length > MORE && (
        <details className="text-[13px]">
          <summary className="cursor-pointer py-1 font-semibold text-primary-text">{items.length - MORE} more</summary>
          <ul className="divide-y divide-border border-t border-border">
            {items.slice(MORE).map((k) => (
              <li key={k.term} className="flex items-center justify-between gap-3 py-1.5 text-[13.5px]">
                <span className="min-w-0 break-words">{k.term}</span>
                <Volume volume={k.volume} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function status(row: MappingRow): { label: string; tone: string } {
  if (!row.url) return { label: 'Page to create', tone: 'bg-primary-chip text-primary-heading' };
  const p = row.currentPosition;
  if (p !== null && p <= 10) return { label: 'On page 1', tone: 'bg-teal-chip text-teal-text' };
  if (p !== null && p <= 30) return { label: 'Close to page 1', tone: 'bg-primary-chip text-primary-heading' };
  return { label: 'Not on Google yet', tone: 'bg-sunken text-ink-2' };
}

export function PagePlanCard({ card, name, path, fixes, href }: {
  card: PageCard;
  /** The page's own name on the site (or the topic for a new page). */
  name: string;
  path: string;
  fixes: number;
  href: string;
}) {
  const row = card.rows[0]!;
  const { primary, secondary, informational } = card;
  const isNew = !row.url;
  const s = status(row);
  const conflict = card.rows.some((r) => r.conflicts.length > 0 && !r.conflictSettled);
  return (
    <article aria-label={name} className={cn('flex flex-col overflow-hidden rounded-card bg-surface', isNew ? 'border-2 border-dashed border-border-strong' : 'border border-border')}>
      <header className={cn('flex flex-wrap items-center justify-between gap-2 px-[18px] py-3', isNew ? 'border-b border-border' : 'bg-primary text-primary-ink')}>
        <h3 className="min-w-0 break-words font-display text-[18px] font-bold">{name}</h3>
        <span className={cn('max-w-full break-all rounded-[6px] px-2 py-0.5 font-mono text-[12px]', isNew ? 'bg-sunken text-ink-2' : 'bg-primary-soft text-primary-ink')}>
          {isNew ? 'Not created yet' : path}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-4 px-[18px] py-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={EYEBROW}>This page wins <span className="font-semibold normal-case tracking-normal">· primary keyword</span></p>
            <span className={`${CHIP} ${s.tone}`}>{s.label}</span>
          </div>
          <p className="flex items-center justify-between gap-3 rounded-[12px] border border-primary-tint bg-primary-wash px-3.5 py-3">
            <strong className="min-w-0 break-words text-[15.5px]">“{primary.term}”</strong>
            <Volume volume={primary.volume} />
          </p>
        </div>
        <KeywordList title="Secondary keywords" hint="also in the title and headings" items={secondary} />
        <KeywordList title="Informational keywords" hint="questions the text and FAQ answer" items={informational} />
        {conflict && <p className="text-[12.5px] font-semibold text-high-strong">Another page competes for these searches. Choose the main page in Expert view.</p>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border px-[18px] py-3">
        <p className="text-[13px] text-ink-2">
          {isNew ? 'Nobody on your site answers these yet.' : fixes > 0 ? `${fixes} ${fixes === 1 ? 'change' : 'changes'} ready for you` : row.pageCheck ? 'Every keyword is in place' : 'Not checked yet'}
          {card.rows.some((r) => r.sentAt) ? ' · sent for approval' : ''}
        </p>
        <Link
          href={href}
          className={cn(
            'inline-flex min-h-10 items-center rounded-button px-4 text-sm font-bold',
            isNew ? 'bg-primary text-primary-ink hover:bg-primary-hover' : 'border border-border-strong bg-surface hover:border-ink-3',
          )}
        >
          {isNew ? 'Draft this page' : fixes > 0 ? `Review ${fixes} ${fixes === 1 ? 'change' : 'changes'}` : row.pageCheck ? 'See the page' : 'Check this page'}
        </Link>
      </footer>
    </article>
  );
}
