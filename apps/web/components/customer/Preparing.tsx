'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** "We are preparing this…": shown while a section is filled in the background; refreshes every 8 s for up to 6 minutes. */
export function Preparing({ what }: { what: string }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (n > 45) clearInterval(t);
      router.refresh();
    }, 8000);
    return () => clearInterval(t);
  }, [router]);
  return (
    <p role="status" className="flex items-center gap-3 rounded-[14px] border border-primary-tint bg-primary-chip px-[18px] py-3.5 text-sm text-ink">
      <span aria-hidden className="size-2.5 shrink-0 animate-pulse rounded-full bg-primary" />
      <span><b>Preparing {what}.</b> This page fills in by itself in a minute or two: no need to click anything.</span>
    </p>
  );
}
