'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/tones';

/**
 * Top-bar account links. The landing page is prerendered, so the session is read in the browser
 * (`/api/me`): signed-in people get one link to their dashboard instead of
 * "Log in" and "Sign up". Until the answer arrives the links are hidden (no flash for signed-in
 * users); they stay in the HTML for visitors and crawlers.
 */
type Who = 'unknown' | 'guest' | 'team' | 'customer';

export function AccountLinks() {
  const [who, setWho] = useState<Who>('unknown');
  useEffect(() => {
    let live = true;
    fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { kind?: Who } | null) => {
        if (live) setWho(s?.kind === 'team' || s?.kind === 'customer' ? s.kind : 'guest');
      })
      .catch(() => live && setWho('guest'));
    return () => {
      live = false;
    };
  }, []);

  if (who === 'team' || who === 'customer') {
    return (
      <Link href={who === 'customer' ? '/my' : '/dashboard'} className="inline-flex min-h-9 items-center whitespace-nowrap rounded-control border border-primary-ink/40 px-3 hover:border-primary-ink">
        Go to dashboard
      </Link>
    );
  }
  return (
    <span className={cn('flex items-center gap-3 transition-opacity', who === 'unknown' ? 'opacity-0' : 'opacity-100')}>
      <Link href="/login" className="inline-flex min-h-9 items-center whitespace-nowrap hover:underline">
        Log in
      </Link>
      <Link href="/signup" className="inline-flex min-h-9 items-center whitespace-nowrap rounded-control border border-primary-ink/40 px-3 hover:border-primary-ink">
        Sign up
      </Link>
    </span>
  );
}
