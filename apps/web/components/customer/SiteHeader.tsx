import Link from 'next/link';
import { cn } from '@/lib/tones';
import { RunAuditButton } from './RunAuditButton';

/** Site heading and section tabs for a customer's website (design: Dashboard redesign). */
export type SiteTab = 'overview' | 'issues' | 'keywords' | 'actions' | 'plan' | 'rankings' | 'competitors' | 'reports' | 'connections';

const LOCK = 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4';

export function SiteHeader({ domain, tab, connected, latestId, pages, running, multiSite, autopilotAt = null }: {
  domain: string;
  tab: SiteTab;
  connected: boolean;
  latestId: string | null;
  pages: number | null;
  running: boolean;
  multiSite: boolean;
  /** Last automatic update of competitors and keywords (design chip "Autopilot on"). */
  autopilotAt?: string | null;
}) {
  const q = `site=${encodeURIComponent(domain)}`;
  // Weekly plan and Rankings are built from Search Console, so they wait for Google.
  const tabs: { key: SiteTab | 'ai' | 'backlinks' | 'settings'; label: string; href?: string; locked?: boolean; soon?: boolean }[] = [
    { key: 'overview', label: 'Overview', href: `/my?${q}` },
    { key: 'issues', label: 'Issues', href: latestId ? `/my/reports/${latestId}` : undefined },
    { key: 'keywords', label: 'Keywords', href: `/my/keywords?${q}` },
    { key: 'actions', label: 'Action plan', href: `/my/actions?${q}` },
    { key: 'plan', label: 'Weekly plan', href: `/my/plan?${q}`, locked: !connected },
    { key: 'rankings', label: 'Rankings', href: `/my/rankings?${q}`, locked: !connected },
    { key: 'ai', label: 'AI search', soon: true },
    { key: 'competitors', label: 'Competitors', href: `/my/competitors?${q}` },
    { key: 'backlinks', label: 'Backlinks', soon: true },
    { key: 'reports', label: 'Reports', href: `/my/reports?${q}` },
    { key: 'connections', label: 'Connections', href: `/my/connections?${q}` },
    { key: 'settings', label: 'Settings', href: '/my/account' },
  ];
  return (
    <div className="flex flex-col gap-4">
      {multiSite && (
        <Link href="/my/sites" className="text-sm text-ink-2 hover:text-ink">
          ← All sites
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-night font-display text-2xl font-extrabold text-primary-tint">
            {domain.charAt(0).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere] sm:text-[28px]">{domain}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <a href={`https://${domain}/`} target="_blank" rel="noopener noreferrer" className="text-[13px] text-ink-2 underline hover:text-ink">
                Visit site
              </a>
              {pages !== null && <span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-bold text-ink-2">{pages} pages checked</span>}
              {autopilotAt && (
                <span className="rounded-full bg-teal-chip px-2.5 py-1 text-xs font-bold text-teal-text" title="Competitors, keywords and the page plan update by themselves every month">
                  Autopilot on · updated {new Date(autopilotAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                </span>
              )}
              {connected ? (
                <span className="rounded-full bg-teal-chip px-2.5 py-1 text-xs font-bold text-teal-text">Google connected</span>
              ) : (
                <span className="rounded-full bg-amber-bg px-2.5 py-1 text-xs font-bold text-amber-text">Waiting for Google</span>
              )}
            </div>
          </div>
        </div>
        <RunAuditButton disabled={running} site={domain} />
      </div>
      {/* Phones: one row that scrolls sideways; wider screens wrap like the design. */}
      <nav aria-label="Site sections" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {tabs.map((t) => {
          const active = t.key === tab;
          const base = 'inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm';
          if (!t.href || t.soon) {
            return (
              <span key={t.key} className={cn(base, 'cursor-default font-medium text-ink-3')} title="Coming soon">
                {t.label}
                {t.soon && <span className="rounded-full bg-sunken px-1.5 text-[11px] font-bold">Soon</span>}
              </span>
            );
          }
          return (
            <Link
              key={t.key}
              href={t.locked ? `/my/connections?${q}` : t.href}
              aria-current={active ? 'page' : undefined}
              className={cn(base, active ? 'bg-night font-bold text-white' : t.locked ? 'font-medium text-ink-3 hover:bg-sunken' : 'font-medium text-ink hover:bg-sunken')}
            >
              {t.label}
              {t.locked && (
                <svg width="14" height="14" viewBox="0 0 24 24" role="img" aria-label="Locked until Google is connected" className="shrink-0">
                  <path d={LOCK} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
