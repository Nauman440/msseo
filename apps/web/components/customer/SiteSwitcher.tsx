'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Website switcher at the top of every customer page: the chosen site's data everywhere. The choice is
 * remembered in a cookie (`my_site`), so pages opened without ?site= stay on the same website.
 */
export const SITE_COOKIE = 'my_site';

export function SiteSwitcher({ sites, fallback, canAdd }: { sites: string[]; fallback: string | null; canAdd: boolean }) {
  const path = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get('site');
  const current = (fromUrl && sites.includes(fromUrl) ? fromUrl : null) ?? (fallback && sites.includes(fallback) ? fallback : null) ?? sites[0] ?? null;
  const box = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (current) document.cookie = `${SITE_COOKIE}=${encodeURIComponent(current)}; path=/; max-age=31536000; samesite=lax`;
  }, [current]);

  if (!current) return null;
  // A page about one audit or account-wide page: switching goes to the same section's start.
  const base = /^\/my\/reports\/[^/]+/.test(path) ? '/my/reports' : /^\/my\/(account|sites|alerts|approvals)/.test(path) ? '/my' : path;
  const href = (d: string) => `${base}?site=${encodeURIComponent(d)}`;
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <span className="text-[13px] font-semibold text-ink-2">Website</span>
      <details ref={box} className="relative">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control border border-border-strong bg-surface px-3.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
          <span className="max-w-[60vw] truncate sm:max-w-xs">{current}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className="shrink-0">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="sr-only">Choose a website</span>
        </summary>
        <div className="absolute left-0 z-40 mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col rounded-[12px] border border-border bg-surface p-1.5 shadow-lg">
          {sites.map((d) => (
            <Link
              key={d}
              href={href(d)}
              onClick={() => box.current?.removeAttribute('open')}
              aria-current={d === current ? 'true' : undefined}
              className={`flex min-h-11 items-center justify-between gap-2 rounded-[8px] px-3 text-sm hover:bg-sunken ${d === current ? 'font-bold' : ''}`}
            >
              <span className="truncate">{d}</span>
              {d === current && <span aria-hidden className="text-primary-heading">✓</span>}
            </Link>
          ))}
          <div className="my-1 border-t border-border" />
          {canAdd && <Link href="/my/sites#add" className="flex min-h-11 items-center rounded-[8px] px-3 text-sm font-semibold text-primary-heading hover:bg-sunken">+ Add a website</Link>}
          <Link href="/my/sites" className="flex min-h-11 items-center rounded-[8px] px-3 text-sm text-ink-2 hover:bg-sunken">Manage websites</Link>
        </div>
      </details>
    </div>
  );
}
