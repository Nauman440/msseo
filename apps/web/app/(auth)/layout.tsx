import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Sign-in pages: the landing page's canvas with one centred white panel. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-canvas px-4 py-12">
      <Link href="/" aria-label="MS SCORE home">
        <Logo height={40} priority />
      </Link>
      <div className="w-full max-w-[420px] rounded-panel border border-border bg-surface p-6 sm:p-8">{children}</div>
    </main>
  );
}
