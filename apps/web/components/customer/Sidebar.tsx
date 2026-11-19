'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutAction } from '@/app/(auth)/actions';
import { SUPPORT_EMAIL } from '@/lib/site';
import { cn } from '@/lib/tones';

/** Customer area sidebar (design: Dashboard redesign, 2026-11-17). Unbuilt areas say "Soon". */
const PATHS: Record<string, string> = {
  overview: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  sites: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18',
  approvals: 'M4 12.5l5 5L20 6.5',
  changes: 'M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l3 2',
  alerts: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  reports: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z',
  autonomy: 'M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  team: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  billing: 'M3 6h18v12H3zM3 10h18',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
};

export function NavIcon({ name, active = false, className }: { name: keyof typeof PATHS; active?: boolean; className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden className={cn('shrink-0', className)}>
      <path d={PATHS[name]} fill="none" stroke={active ? '#FDBA74' : '#94A3B8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Item = { label: string; icon: keyof typeof PATHS; href?: string; match?: RegExp };
const MAIN: Item[] = [
  { label: 'Overview', icon: 'overview', href: '/my', match: /^\/my(\/(plan|rankings|connections|connect|keywords|pages|actions|competitors|content|ai-search|backlinks|local|tracking|monitor))?$/ },
  { label: 'Sites', icon: 'sites', href: '/my/sites', match: /^\/my\/sites/ },
  { label: 'Approvals', icon: 'approvals', href: '/my/approvals', match: /^\/my\/approvals/ },
  { label: 'Changes', icon: 'changes' },
  { label: 'Alerts', icon: 'alerts', href: '/my/alerts', match: /^\/my\/alerts/ },
  { label: 'Reports', icon: 'reports', href: '/my/reports', match: /^\/my\/reports/ },
  { label: 'Free audit', icon: 'search', href: '/free' },
];
const ACCOUNT: Item[] = [
  { label: 'Autonomy', icon: 'autonomy' },
  { label: 'Team', icon: 'team' },
  { label: 'Billing', icon: 'billing', href: '/my/account#plan' },
  { label: 'Settings', icon: 'settings', href: '/my/account', match: /^\/my\/account/ },
];

function NavList({ items, path }: { items: Item[]; path: string }) {
  return (
    <>
      {items.map((it) => {
        const active = Boolean(it.match?.test(path));
        const body = (
          <>
            <NavIcon name={it.icon} active={active} />
            <span className="flex-1">{it.label}</span>
            {!it.href && <span className="rounded-full bg-night-3 px-2 py-0.5 text-[11px] font-bold text-mist-3">Soon</span>}
          </>
        );
        const cls = cn('flex min-h-11 items-center gap-3 rounded-control px-3 text-[15px]', active ? 'bg-night-3 font-semibold text-white' : 'font-medium text-mist-3');
        return it.href ? (
          <Link key={it.label} href={it.href} aria-current={active ? 'page' : undefined} className={cn(cls, !active && 'hover:bg-night-2 hover:text-white')}>
            {body}
          </Link>
        ) : (
          <span key={it.label} className={cn(cls, 'cursor-default opacity-70')} title="Coming soon">
            {body}
          </span>
        );
      })}
    </>
  );
}

export function SidebarBody({ name, plan, canAddSite }: { name: string; plan: string; canAddSite: boolean }) {
  const path = usePathname() ?? '/my';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
  return (
    <div className="flex h-full flex-col gap-3.5">
      <nav aria-label="Your account" className="flex flex-col gap-0.5">
        <NavList items={MAIN} path={path} />
        <p className="px-3 pb-1 pt-3 text-[11.5px] font-extrabold tracking-[0.08em] text-mist-3">ACCOUNT</p>
        <NavList items={ACCOUNT} path={path} />
      </nav>
      {canAddSite && (
        <Link href="/my/sites" className="flex min-h-11 items-center justify-center rounded-control border border-dashed border-night-line text-sm font-semibold text-mist-3 hover:border-mist-3 hover:text-white">
          + Add website
        </Link>
      )}
      <div className="mt-auto flex flex-col gap-2 rounded-[14px] bg-night-3 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-white">
          <NavIcon name="team" active />
          Want a team on it?
        </p>
        <p className="text-[13px] leading-normal text-mist-3">Our SEO specialists can run strategy, content and links for you.</p>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Talk to an SEO expert')}`} className="text-[13px] font-bold text-primary-tint underline">
          Talk to an expert
        </a>
      </div>
      <div className="flex items-center gap-2.5 px-1.5 py-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-chip text-[13px] font-extrabold text-primary-heading">{initials}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <p className="text-xs text-mist-3">{plan}</p>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="min-h-9 rounded-control px-2 text-xs font-semibold text-mist-3 hover:text-white">
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
