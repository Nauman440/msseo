import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { ButtonLink } from '@/components/ui/Button';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/audits/demo', label: 'Sample report' },
  { href: '/audits/demo/print', label: 'PDF layout' },
];

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-night-line bg-night print:hidden">
      <div className="mx-auto flex h-16 max-w-page items-center gap-8 px-4 sm:px-6">
        <Link href="/" aria-label="Morosoft SEO Audit home" className="rounded-control">
          <Logo height={44} priority />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-full px-3 py-2 text-sm font-medium text-white/65 transition-colors hover:bg-white/5 hover:text-white"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <ButtonLink href="/audits/new" variant="brand" className="min-h-9 px-4">
            New audit
          </ButtonLink>
          <span
            className="hidden size-9 items-center justify-center rounded-full bg-night-3 text-xs font-semibold text-white/80 sm:flex"
            aria-label="Signed in as team member"
          >
            MT
          </span>
        </div>
      </div>
    </header>
  );
}
