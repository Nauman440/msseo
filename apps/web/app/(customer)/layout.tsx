import type { Metadata } from 'next';
import Link from 'next/link';
import { signOutAction } from '@/app/(auth)/actions';
import { Logo } from '@/components/ui/Logo';
import { getAccountByUserId } from '@/lib/accounts';
import { requireCustomer } from '@/lib/session';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Customer area (step 8): their own website only. */
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link href="/my" aria-label="Your dashboard" className="shrink-0">
            <Logo height={30} />
          </Link>
          <div className="flex min-w-0 items-center gap-4">
            <span className="hidden truncate text-sm text-ink-2 sm:inline">{account?.businessName ?? user.name}</span>
            <form action={signOutAction}>
              <button type="submit" className="min-h-10 rounded-button border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-page flex-col gap-2 px-4 py-6 text-[13px] text-ink-3 sm:flex-row sm:justify-between sm:px-6">
          <p>MSScore by Morosoft Technologies</p>
          <p>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link> · <Link href="/terms" className="hover:text-ink">Terms</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
