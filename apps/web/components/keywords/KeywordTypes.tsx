import Link from 'next/link';
import { KEYWORD_ROLES, keywordRoles, type KeywordRecord, type KeywordRole, type KeywordWorkspace } from '@seo/core';
import { cn } from '@/lib/tones';
import { ROLE_CHIP, ROLE_HINT, ROLE_TITLE } from './labels';

/**
 * Keywords → "Your keywords by type" (2026-11-25, user request): every kept keyword is an intent,
 * supporting or informational keyword (`keywordRoles()`); the most searched of each, then a link to
 * the full list filtered to that type.
 */
const FIRST = 6;

export function KeywordTypes({ ws, href }: { ws: KeywordWorkspace; href: (role: KeywordRole) => string }) {
  const roles = keywordRoles(ws);
  const by = new Map<KeywordRole, KeywordRecord[]>(KEYWORD_ROLES.map((r) => [r, []]));
  for (const [k, r] of roles) by.get(r)!.push(k);
  if (!roles.size) return null;
  return (
    <section aria-labelledby="keyword-types" className="flex flex-col gap-3">
      <div>
        <h2 id="keyword-types" className="font-display text-xl font-bold">Your keywords by type</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">Only searches about what you {ws.businessType === 'shop' ? 'sell' : 'offer'} are kept. Each one has a job.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {KEYWORD_ROLES.map((role) => {
          const list = [...by.get(role)!].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
          return (
            <article key={role} aria-labelledby={`type-${role}`} className="flex min-w-0 flex-col gap-2.5 rounded-card border border-border bg-surface px-[18px] py-4">
              <div className="flex items-center justify-between gap-2">
                <h3 id={`type-${role}`} className="text-[15.5px] font-bold">{ROLE_TITLE[role]}</h3>
                <span className={cn('rounded-full px-2.5 py-0.5 text-[12.5px] font-bold tabular', ROLE_CHIP[role])}>{list.length}</span>
              </div>
              <p className="text-[13px] text-ink-2">{ROLE_HINT[role]}</p>
              {list.length === 0 ? (
                <p className="text-[13px] text-ink-3">None yet.</p>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {list.slice(0, FIRST).map((k) => (
                    <li key={k.term} className="flex items-center justify-between gap-3 py-1.5 text-[13.5px]">
                      <span className="min-w-0 break-words">{k.term}</span>
                      <span className="shrink-0 text-[12.5px] text-ink-2 tabular">{k.volume ? `${k.volume.toLocaleString('en-US')}/mo` : '–'}</span>
                    </li>
                  ))}
                </ul>
              )}
              {list.length > FIRST && (
                <Link href={href(role)} className="mt-auto text-[13.5px] font-semibold text-primary-text underline">
                  See all {list.length}
                </Link>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
