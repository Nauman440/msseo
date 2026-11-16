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

/** Category cards in the landing page's card style (white, 18px radius, Sora headings). */
export function CategoryGrid() {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {ORDER.map((c) => (
        <li key={c} className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-[22px]">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-[17px] font-bold leading-tight">{CATEGORY_LABEL[c]}</h3>
            <span className="shrink-0 rounded-pill bg-primary-chip px-2 py-0.5 text-xs font-bold text-primary-heading tabular">{CATEGORY_WEIGHT[c]}%</span>
          </div>
          <p className="text-sm leading-[1.55] text-ink-2">{CATEGORY_NOTE[c]}</p>
        </li>
      ))}
      <li className="flex flex-col justify-end rounded-panel bg-night p-[22px]">
        <p className="text-sm leading-[1.55] text-mist-2">The percentage is each category&apos;s weight in the overall score. Categories with nothing to check are left out.</p>
      </li>
    </ul>
  );
}

const STATUS_STYLE: Record<ModuleStatus, { label: string; chip: string }> = {
  live: { label: 'Live', chip: 'bg-pass-bg text-pass-text' },
  building: { label: 'Building now', chip: 'bg-primary-chip text-primary-heading' },
  planned: { label: 'Planned', chip: 'bg-sunken text-ink-2' },
};

export function ModuleRoadmap({ modules }: { modules: { n: number; name: string; status: ModuleStatus }[] }) {
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {modules.map((m) => (
        <li key={m.n} className="flex items-center gap-4 rounded-[14px] border border-border bg-surface px-4 py-3">
          <span className="w-7 font-display text-base font-extrabold text-primary tabular">{String(m.n).padStart(2, '0')}</span>
          <span className={cn('flex-1 text-[15px] font-semibold', m.status === 'planned' ? 'text-ink-2' : 'text-ink')}>{m.name}</span>
          <span className={cn('shrink-0 rounded-pill px-2.5 py-1 text-xs font-bold', STATUS_STYLE[m.status].chip)}>{STATUS_STYLE[m.status].label}</span>
        </li>
      ))}
    </ol>
  );
}
