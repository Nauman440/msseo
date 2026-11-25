import Link from 'next/link';
import type { FastTopic } from '@seo/core';
import { cn } from '@/lib/tones';
import { CHIP } from './labels';
import { KeywordList, Volume } from './PagePlanCard';

/**
 * One page of the simple page plan when the fast keyword pipeline has run (2026-11-25): the same saved
 * result as the Keywords tab, so both always show the same topics, keywords and pages.
 */
const EYEBROW = 'text-[11px] font-extrabold uppercase tracking-[0.07em] text-ink-2';
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

function status(t: FastTopic): { label: string; tone: string } {
  if (t.isNew) return { label: t.opportunity === 'article' ? 'Article to write' : 'Page to create', tone: 'bg-primary-chip text-primary-heading' };
  if (t.position !== null && t.position <= 10) return { label: 'On page 1', tone: 'bg-teal-chip text-teal-text' };
  if (t.position !== null && t.position <= 30) return { label: 'Close to page 1', tone: 'bg-primary-chip text-primary-heading' };
  return { label: 'Not on Google yet', tone: 'bg-sunken text-ink-2' };
}

export function FastPageCard({ t, fixes, href }: { t: FastTopic; fixes: number; href: string }) {
  const s = status(t);
  const main = t.keywords[0];
  const rest = t.keywords.slice(1);
  const kw = (k: FastTopic['keywords'][number]) => ({ term: k.keyword, volume: k.volume, position: k.position });
  return (
    <article aria-label={t.pageName} className={cn('flex flex-col overflow-hidden rounded-card bg-surface', t.isNew ? 'border-2 border-dashed border-border-strong' : 'border border-border')}>
      <header className={cn('flex flex-wrap items-center justify-between gap-2 px-[18px] py-3', t.isNew ? 'border-b border-border' : 'bg-primary text-primary-ink')}>
        <h3 className="min-w-0 break-words font-display text-[18px] font-bold">{t.isNew ? t.topic : t.pageName}</h3>
        <span className={cn('max-w-full break-all rounded-[6px] px-2 py-0.5 font-mono text-[12px]', t.isNew ? 'bg-sunken text-ink-2' : 'bg-primary-soft text-primary-ink')}>
          {t.isNew || !t.pageUrl ? 'Not created yet' : path(t.pageUrl)}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-4 px-[18px] py-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={EYEBROW}>This page wins <span className="font-semibold normal-case tracking-normal">· primary keyword</span></p>
            <span className={`${CHIP} ${s.tone}`}>{s.label}</span>
          </div>
          <p className="flex items-center justify-between gap-3 rounded-[12px] border border-primary-tint bg-primary-wash px-3.5 py-3">
            <strong className="min-w-0 break-words text-[15.5px]">“{t.mainKeyword}”</strong>
            <Volume volume={main?.volume ?? null} />
          </p>
        </div>
        <KeywordList title="Secondary keywords" hint="also in the title and headings" items={rest.filter((k) => k.role !== 'question').map(kw)} />
        <KeywordList title="Informational keywords" hint="questions the text and FAQ answer" items={rest.filter((k) => k.role === 'question').map(kw)} />
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border px-[18px] py-3">
        <p className="text-[13px] text-ink-2">{t.isNew ? 'Nobody on your site answers these yet.' : fixes > 0 ? `${fixes} ${fixes === 1 ? 'change' : 'changes'} ready for you` : 'Not checked yet'}</p>
        <Link
          href={href}
          className={cn('inline-flex min-h-10 items-center rounded-button px-4 text-sm font-bold', t.isNew ? 'bg-primary text-primary-ink hover:bg-primary-hover' : 'border border-border-strong bg-surface hover:border-ink-3')}
        >
          {t.isNew ? (t.opportunity === 'article' ? 'Draft this article' : 'Draft this page') : fixes > 0 ? `Review ${fixes} ${fixes === 1 ? 'change' : 'changes'}` : 'Check this page'}
        </Link>
      </footer>
    </article>
  );
}
