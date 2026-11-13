'use client';

import { useState } from 'react';
import { cn } from '@/lib/tones';

/** Downloads the server-rendered PDF and shows progress, since rendering takes a few seconds. */
export function DownloadPdfButton({ auditId, mode, className }: { auditId: string; mode: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  async function download() {
    setState('busy');
    try {
      const res = await fetch(`/api/audits/${auditId}/pdf?mode=${mode}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'seo-audit.pdf';
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={state === 'busy'}
      aria-live="polite"
      className={cn(
        'inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-button bg-primary px-5 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover disabled:cursor-wait disabled:opacity-80',
        className,
      )}
    >
      {state === 'busy' && <span className="size-4 animate-spin rounded-full border-2 border-primary-ink/30 border-t-primary-ink" aria-hidden="true" />}
      {state === 'busy' ? 'Preparing PDF…' : state === 'error' ? 'PDF failed, try again' : 'Download PDF'}
    </button>
  );
}
