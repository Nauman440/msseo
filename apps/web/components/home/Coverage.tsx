import { CATEGORY_LABEL, CATEGORY_WEIGHT, type Category } from '@seo/core';
import type { ModuleStatus } from '@/lib/home-data';
import { cn } from '@/lib/tones';

const CATEGORY_NOTE: Record<Category, string> = {
  technical: 'Crawlability, indexing, redirects, canonicals, sitemaps, schema, internal links',
  onpage: 'Titles, meta, headings, thin and duplicate content, images, internal links',
  speed: 'Core Web Vitals field data plus Lighthouse per page template',
  mobile: 'Viewport, tap targets, rendered content, click-to-call',
  ai: 'Direct answers, FAQs, structure and AI crawler access',
  trust: 'Reviews, licences, guarantees, real business identity',
  security: 'HTTPS, certificate expiry, mixed content, security headers',
};

const ORDER: Category[] = ['technical', 'onpage', 'speed', 'mobile', 'ai', 'trust', 'security'];

export function CategoryGrid() {
  return (
    <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {ORDER.map((c) => (
        <li key={c} className="bg-surface p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-[15px] font-semibold tracking-tight">{CATEGORY_LABEL[c]}</h3>
            <span className="text-xs font-medium text-ink-3 tabular">{CATEGORY_WEIGHT[c]}%</span>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-ink-2">{CATEGORY_NOTE[c]}</p>
        </li>
      ))}
      <li className="flex flex-col justify-end bg-primary-soft p-5">
        <p className="text-[13px] leading-5 text-primary-text">
          Percent = weight in the overall score. Categories with nothing to check are left out.
        </p>
      </li>
    </ul>
  );
}

const STATUS_STYLE: Record<ModuleStatus, { label: string; dot: string; text: string }> = {
  live: { label: 'Live', dot: 'bg-chart-pass', text: 'text-pass-text' },
  building: { label: 'Building now', dot: 'bg-primary', text: 'text-primary-text' },
  planned: { label: 'Planned', dot: 'bg-chart-neutral', text: 'text-ink-3' },
};

export function ModuleRoadmap({ modules }: { modules: { n: number; name: string; status: ModuleStatus }[] }) {
  return (
    <ol className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
      {modules.map((m) => (
        <li key={m.n} className="flex items-center gap-4 border-b border-border py-3">
          <span className="w-6 font-display text-sm font-semibold text-ink-3 tabular">{String(m.n).padStart(2, '0')}</span>
          <span className={cn('flex-1 text-sm font-medium', m.status === 'planned' ? 'text-ink-2' : 'text-ink')}>{m.name}</span>
          <span className={cn('flex items-center gap-1.5 text-xs font-medium', STATUS_STYLE[m.status].text)}>
            <span className={cn('size-1.5 rounded-full', STATUS_STYLE[m.status].dot)} />
            {STATUS_STYLE[m.status].label}
          </span>
        </li>
      ))}
    </ol>
  );
}
