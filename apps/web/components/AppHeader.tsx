import Link from 'next/link';
import { signOutAction } from '@/app/(auth)/actions';
import { Logo } from '@/components/ui/Logo';
import type { SessionUser } from '@/lib/session';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/audits/demo', label: 'Sample report' },
  { href: '/audits/demo/print', label: 'PDF layout' },
];

const initials = (name: string) =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';

/** Team app header, styled like the public landing page header (white bar, dark logo, orange CTA). */
export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface print:hidden">
      <div className="mx-auto flex h-16 max-w-page items-center gap-6 px-4 sm:px-6">
        <Link href="/dashboard" aria-label="MS SCORE dashboard" className="shrink-0 rounded-control">
          <Logo height={32} priority />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-[22px] text-[15px]">
            {[...NAV, ...(user.role === 'admin' ? [{ href: '/settings/users', label: 'Users' }] : [])].map((item) => (
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
          <details className="relative">
            <summary
              className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full bg-night text-xs font-semibold text-mist [&::-webkit-details-marker]:hidden"
              aria-label={`Account menu for ${user.name}`}
            >
              {initials(user.name)}
            </summary>
            <div className="absolute right-0 top-12 w-60 rounded-panel border border-border bg-surface p-2 shadow-lift">
              <p className="truncate px-3 py-2 text-[13px] text-ink-3">{user.email ?? user.name}</p>
              <Link href="/settings/account" className="block rounded-control px-3 py-2.5 text-sm font-semibold hover:bg-sunken">
                Your account
              </Link>
              {user.role === 'admin' && (
                <Link href="/settings/users" className="block rounded-control px-3 py-2.5 text-sm font-semibold hover:bg-sunken">
                  Team members
                </Link>
              )}
              {!user.local && (
                <form action={signOutAction}>
                  <button type="submit" className="w-full rounded-control px-3 py-2.5 text-left text-sm font-semibold text-high-text hover:bg-sunken">
                    Sign out
                  </button>
                </form>
              )}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
