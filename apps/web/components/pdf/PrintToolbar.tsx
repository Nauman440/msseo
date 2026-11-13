import Link from 'next/link';
import { DownloadPdfButton } from '@/components/report/DownloadPdfButton';

/** Screen-only preview bar. The PDF itself is rendered on the server, not by the browser's print dialog. */
export function PrintToolbar({ backHref, auditId, mode }: { backHref: string; auditId: string; mode: string }) {
  return (
    <div className="mx-auto mb-6 flex w-[210mm] max-w-full items-center justify-between gap-3 print:hidden">
      <Link href={backHref} className="text-sm font-semibold text-ink-2 hover:text-ink">
        ← Back to report
      </Link>
      <DownloadPdfButton auditId={auditId} mode={mode} />
    </div>
  );
}
