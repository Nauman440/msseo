'use client';

import Link from 'next/link';

/** Screen-only preview bar. The worker renders PDFs headlessly; this is for previews. */
export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="mx-auto mb-6 flex w-[210mm] max-w-full items-center justify-between gap-3 print:hidden">
      <Link href={backHref} className="text-sm font-semibold text-ink-2 hover:text-ink">
        ← Back to report
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover"
      >
        Save as PDF
      </button>
    </div>
  );
}
