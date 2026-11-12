import { AppHeader } from '@/components/AppHeader';
import { Logo } from '@/components/ui/Logo';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <AppHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border bg-surface print:hidden">
        <div className="mx-auto flex max-w-page flex-col gap-3 px-4 py-6 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo tone="dark" />
          <p>Internal tool · Morosoft Technologies team only</p>
        </div>
      </footer>
    </div>
  );
}
