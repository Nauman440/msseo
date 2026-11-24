'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** "Writing your plan · step …": shown while the plan is written in the background; refreshes every 10 s for up to 20 minutes. */
export function PlanWriting({ step, startedAt }: { step: string; startedAt: string }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (n > 120) clearInterval(t);
      router.refresh();
    }, 10_000);
    return () => clearInterval(t);
  }, [router]);
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 60_000));
  return (
    <p role="status" className="flex items-center gap-3 rounded-[14px] border border-primary-tint bg-primary-chip px-[18px] py-3.5 text-sm text-ink">
      <span aria-hidden className="size-2.5 shrink-0 animate-pulse rounded-full bg-primary" />
      <span>
        <b>Writing your 6-month plan.</b> {step}… (started {minutes ? `${minutes} min ago` : 'just now'}; it usually takes 5–10 minutes). This page updates itself.
      </span>
    </p>
  );
}
