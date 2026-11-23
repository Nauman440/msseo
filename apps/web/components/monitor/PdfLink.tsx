/** "Download PDF" for the weekly, monthly and action plan reports (made on the server, so it always looks the same). */
export function PdfLink({ href, label = 'Download PDF', primary = false }: { href: string; label?: string; primary?: boolean }) {
  return (
    <a
      href={href}
      download
      className={
        primary
          ? 'inline-flex min-h-10 items-center rounded-button bg-primary px-4 text-sm font-bold text-primary-ink hover:bg-primary-hover print:hidden'
          : 'inline-flex min-h-10 items-center rounded-control border border-border-strong bg-surface px-4 text-sm font-semibold hover:border-ink-3 print:hidden'
      }
    >
      {label}
    </a>
  );
}
