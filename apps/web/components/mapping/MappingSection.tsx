import { blogIdeas, normUrl, type KeywordRecord } from '@seo/core';
import { viewHref } from '@/components/keywords/KeywordTabs';
import { customerAudits } from '@/lib/customer-data';
import { getKeywordWorkspace } from '@/lib/keywords';
import { fixCounts, getMapping, loadPageMap } from '@/lib/mapping';
import { BlogIdeas } from './BlogIdeas';
import { providerConfig } from '@/lib/providers-config';
import { BriefView } from './BriefView';
import { MAPPING_FILTERS, type MappingFilter } from './labels';
import { MappingOverview } from './MappingOverview';
import { PageMapView } from './PageMapView';
import { PagePlan } from './PagePlan';
import Link from 'next/link';
import { cn } from '@/lib/tones';

/**
 * The "Page mapping" sub-tab of Keywords (Module 5): the overview, or with `topic` the keyword map
 * for one page (or the brief for a new page). Loads its own data; the same for team and customers.
 */
export type MappingParams = { topic?: string; show?: string; all?: string; mode?: string };

export async function MappingSection({ domain, base, audience, keywords, params }: {
  domain: string;
  base: string;
  audience: 'team' | 'customer';
  keywords: KeywordRecord[];
  params: MappingParams;
}) {
  const href = (extra: Record<string, string> = {}) => viewHref(base, 'mapping', extra);
  const audits = await customerAudits(`https://${domain}/`);
  const reportPages = audits.latest?.pages ?? [];

  if (params.topic) {
    const r = await loadPageMap(domain, params.topic);
    if (r) {
      const choices = [...reportPages.map((p) => p.url), ...(r.ws.sitemapOnly ?? [])];
      if (!r.row.url && r.brief) {
        return <BriefView domain={domain} row={r.row} brief={r.brief} pages={choices} backHref={href()} mdHref={`/api/mapping/${domain}/brief?topic=${encodeURIComponent(r.row.clusterId)}`} />;
      }
      return (
        <PageMapView
          domain={domain}
          row={r.row}
          map={r.map}
          fixes={r.fixes}
          check={r.check}
          checkFailed={r.checkFailed}
          gaps={r.gaps}
          topics={r.ws.rows.map((x) => ({ id: x.clusterId, name: x.topic }))}
          backHref={href()}
          nextHref={r.next ? href({ topic: r.next }) : null}
          audience={audience}
          pageType={reportPages.find((p) => normUrl(p.url) === normUrl(r.row.url!))?.pageType ?? null}
        />
      );
    }
  }

  const [ws, kw] = await Promise.all([getMapping(domain), getKeywordWorkspace(domain)]);
  const fixes = await fixCounts(ws);
  const filter = MAPPING_FILTERS.includes(params.show as MappingFilter) ? (params.show as MappingFilter) : null;
  const expert = params.mode === 'expert';
  const ideas = blogIdeas(kw, ws);
  const toggle = (
    <nav aria-label="Page plan view" className="flex justify-end">
      <span className="inline-flex rounded-button border border-border-strong bg-surface p-1">
        {[{ key: false, label: 'Simple view' }, { key: true, label: 'Expert view' }].map((m) => (
          <Link
            key={m.label}
            href={href(m.key ? { mode: 'expert' } : {})}
            aria-current={expert === m.key ? 'page' : undefined}
            className={cn('inline-flex min-h-10 items-center rounded-[8px] px-3.5 text-[13.5px] font-semibold', expert === m.key ? 'bg-night text-white' : 'text-ink hover:bg-sunken')}
          >
            {m.label}
          </Link>
        ))}
      </span>
    </nav>
  );
  if (!expert) {
    return (
      <div className="flex flex-col gap-[22px]">
        {toggle}
        <PagePlan ws={ws} keywords={keywords} places={kw.seeds.locations} fast={kw.fast ?? null} fixes={fixes} reportPages={reportPages} ideas={ideas} href={href} />
      </div>
    );
  }
  const expertHref = (extra: Record<string, string> = {}) => href({ mode: 'expert', ...extra });
  return (
    <div className="flex flex-col gap-[22px]">
      {toggle}
      <MappingOverview
        ws={ws}
        keywords={keywords}
        fixes={fixes}
        pages={[...reportPages.map((p) => p.url), ...(ws.sitemapOnly ?? [])]}
        reportPages={reportPages}
        audience={audience}
        aiAvailable={Boolean(providerConfig().env?.openai)}
        href={expertHref}
        filter={filter}
        showAll={params.all === '1'}
      />
      <BlogIdeas domain={domain} ideas={ideas} />
    </div>
  );
}
