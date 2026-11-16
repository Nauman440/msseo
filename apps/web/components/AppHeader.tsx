import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/audits/demo', label: 'Sample report' },
  { href: '/audits/demo/print', label: 'PDF layout' },
];

/** Team app header, styled like the public landing page header (white bar, dark logo, orange CTA). */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface print:hidden">
      <div className="mx-auto flex h-16 max-w-page items-center gap-6 px-4 sm:px-6">
        <Link href="/dashboard" aria-label="MS SCORE dashboard" className="shrink-0 rounded-control">
          <Logo height={32} priority />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-[22px] text-[15px]">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="font-medium text-ink-2 transition-colors hover:text-ink">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/audits/new"
            className="inline-flex min-h-[42px] items-center rounded-control bg-primary px-4 text-sm font-extrabold text-primary-ink transition-colors hover:bg-primary-hover sm:px-5"
          >
            New audit
          </Link>
          <span className="hidden size-9 items-center justify-center rounded-full bg-night text-xs font-semibold text-mist sm:flex" aria-label="Signed in as team member">
            MT
          </span>
        </div>
      </div>
    </header>
  );
}
