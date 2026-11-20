'use client';

import { useId } from 'react';
import { GLOSSARY, type GlossaryKey } from '@/lib/glossary';

/**
 * An SEO word with a small ⓘ that explains it in plain words (hover, keyboard focus or tap). The
 * explanation is display:none until shown, so it never widens the page on phones.
 */
export function Term({ k, children }: { k: GlossaryKey; children: React.ReactNode }) {
  const id = useId();
  return (
    <span className="group relative inline-flex items-center gap-1">
      {children}
      <button
        type="button"
        aria-describedby={id}
        aria-label={`What does this mean?`}
        className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border border-border-strong text-[11px] font-bold leading-none text-ink-2 hover:border-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 print:hidden"
      >
        i
      </button>
      <span
        role="tooltip"
        id={id}
        className="absolute left-0 top-full z-50 mt-1.5 hidden w-64 max-w-[calc(100vw-2rem)] rounded-[10px] bg-night px-3 py-2 text-left text-[12.5px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg group-focus-within:block group-hover:block"
      >
        {GLOSSARY[k]}
      </span>
    </span>
  );
}
