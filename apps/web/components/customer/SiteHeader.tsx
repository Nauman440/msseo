import Link from 'next/link';
import { cn } from '@/lib/tones';
import { RunAuditButton } from './RunAuditButton';

/** Site heading and section tabs for a customer's website (design: Dashboard redesign). */
export type SiteTab = 'overview' | 'issues' | 'keywords' | 'actions' | 'backlinks' | 'local' | 'content' | 'ai-search' | 'tracking' | 'monitor' | 'plan' | 'rankings' | 'competitors' | 'reports' | 'connections';

const LOCK = 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4';

export function SiteHeader({ domain, tab, connected, latestId, pages, running, autopilotAt = null, locks = {} }: {
  domain: string;
  tab: SiteTab;
  connected: boolean;
  latestId: string | null;
  pages: number | null;
  running: boolean;
  /** Last automatic update of competitors and keywords (design chip "Autopilot on"). */
  autopilotAt?: string | null;
  /** Tabs whose journey step is not open yet, with the step that opens them. */
  locks?: Partial<Record<SiteTab, { n: number; title: string }>>;
}) {
  const q = `site=${encodeURIComponent(domain)}`;
  // In the order of the journey. Weekly plan and Rankings are built from Search Console, so they also wait for Google.
  const tabs: { key: SiteTab | 'settings'; label: string; href?: string; google?: boolean }[] = [
    { key: 'overview', label: 'Overview', href: `/my?${q}` },
    { key: 'issues', label: 'Issues', href: latestId ? `/my/reports/${latestId}?${q}` : undefined },
    { key: 'connections', label: 'Connections', href: `/my/connections?${q}` },
    { key: 'competitors', label: 'Competitors', href: `/my/competitors?${q}` },
    { key: 'keywords', label: 'Keywords', href: `/my/keywords?${q}` },
    { key: 'actions', label: 'Action plan', href: `/my/actions?${q}` },
    { key: 'content', label: 'Content', href: `/my/content?${q}` },
    { key: 'local', label: 'Local', href: `/my/local?${q}` },
    { key: 'backlinks', label: 'Backlinks', href: `/my/backlinks?${q}` },
    { key: 'ai-search', label: 'AI search', href: `/my/ai-search?${q}` },
    { key: 'tracking', label: 'Tracking', href: `/my/tracking?${q}` },
    { key: 'monitor', label: 'Monitoring', href: `/my/monitor?${q}` },
    { key: 'plan', label: 'Weekly plan', href: `/my/plan?${q}`, google: true },
    { key: 'rankings', label: 'Rankings', href: `/my/rankings?${q}`, google: true },
    { key: 'reports', label: 'Reports', href: `/my/reports?${q}` },
    { key: 'settings', label: 'Settings', href: '/my/account' },
  ];
  return (
    <div className="flex flex-col gap-4">
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
          if (!t.href) {
            return (
              <span key={t.key} className={cn(base, 'cursor-default font-medium text-ink-3')} title="Available after the first audit">
                {t.label}
              </span>
            );
          }
          const step = t.key !== 'settings' ? locks[t.key] : undefined;
          const googleLocked = t.google && !connected;
          const locked = Boolean(step) || googleLocked;
          const why = step ? `Opens after step ${step.n}: ${step.title}` : googleLocked ? 'Opens when Google is connected' : undefined;
          return (
            <Link
              key={t.key}
              href={googleLocked && !step ? `/my/connections?${q}` : t.href}
              aria-current={active ? 'page' : undefined}
              title={why}
              className={cn(base, active ? 'bg-night font-bold text-white' : locked ? 'font-medium text-ink-3 hover:bg-sunken' : 'font-medium text-ink hover:bg-sunken')}
            >
              {t.label}
              {locked && (
                <svg width="14" height="14" viewBox="0 0 24 24" role="img" aria-label={why} className="shrink-0">
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
