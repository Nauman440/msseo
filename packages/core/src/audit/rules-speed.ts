import { countPages, plural, type RuleDef } from './types';

/** Core Web Vitals thresholds (web.dev/vitals): good / poor boundaries. */
export const CWV = {
  lcpMs: { good: 2500, poor: 4000 },
  inpMs: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
  ttfbMs: { good: 800, poor: 1800 },
} as const;

export function rate(value: number | undefined, t: { good: number; poor: number }) {
  if (value === undefined) return undefined;
  return value <= t.good ? 'good' : value <= t.poor ? 'needs-improvement' : 'poor';
}

/** §6.2 1.8.x from PageSpeed Insights (homepage, mobile) and crawl timings. */
export const speedRules: RuleDef[] = [
  {
    id: '1.8.1', module: 1, category: 'speed', card: 'speed', scope: 'site', severity: 'high',
    title: { client: 'Pages load slowly on phones', expert: 'Core Web Vitals (mobile)' },
    explain: { client: 'Slow pages lose visitors and rank lower on Google.', expert: 'LCP/INP/CLS are ranking signals (page experience).' },
    fix: { client: 'Compress images and remove heavy scripts.', expert: 'Optimise LCP element, defer JS, reserve layout space.' },
    ice: { impact: 4, confidence: 4, effort: 3 },
    evaluate: ({ data }) => {
      const psi = data.psi;
      if (!psi) return null;
      const src = psi.field ?? psi.lab;
      const ratings = [rate(src.lcpMs, CWV.lcpMs), rate(psi.field?.inpMs, CWV.inpMs), rate(src.cls, CWV.cls)].filter(Boolean);
      const label = psi.field ? 'field data' : 'lab data';
      const lcp = src.lcpMs !== undefined ? `${(src.lcpMs / 1000).toFixed(1)} s` : 'n/a';
      if (ratings.includes('poor')) return { status: 'fail', message: { client: `The main content takes ${lcp} to appear on phones`, expert: `Mobile CWV poor (${label}), LCP ${lcp}` } };
      if (ratings.includes('needs-improvement')) return { status: 'warn', message: { client: 'Phone loading speed needs work', expert: `Mobile CWV needs improvement (${label}), LCP ${lcp}` } };
      return { status: 'pass', message: { client: 'Pages load quickly on phones', expert: `Mobile CWV good (${label}), LCP ${lcp}` } };
    },
  },
  {
    id: '1.8.2', module: 1, category: 'speed', card: 'speed', scope: 'site', severity: 'medium',
    title: { client: 'Low mobile speed score', expert: 'Lighthouse performance (mobile)' },
    explain: { client: 'Google’s speed test scores the homepage out of 100.', expert: 'Lighthouse performance < 50 fail, < 90 warn.' },
    fix: { client: 'Work through the speed suggestions.', expert: 'Address Lighthouse opportunities.' },
    ice: { impact: 3, confidence: 4, effort: 3 },
    evaluate: ({ data }) => {
      const score = data.psi?.performance;
      if (score === null || score === undefined) return null;
      const status = score < 50 ? 'fail' : score < 90 ? 'warn' : 'pass';
      return { status, metrics: { performance: score }, message: { client: `Mobile speed score ${score}/100`, expert: `Lighthouse mobile performance ${score}` } };
    },
  },
  {
    id: '1.8.4', module: 1, category: 'speed', card: 'speed', scope: 'page', severity: 'medium',
    title: { client: 'Files block pages from showing', expert: 'Render-blocking resources' },
    explain: { client: 'Some files must load before anything appears, which slows pages.', expert: 'Render-blocking CSS/JS delays first paint.' },
    fix: { client: 'Ask the developer to load these files later.', expert: 'Inline critical CSS; defer/async JS.' },
    ice: { impact: 2, confidence: 4, effort: 3 },
    evaluate: ({ ok }) => countPages(ok, (p) => p.checks?.has_render_blocking_resources === true, (n) =>
      n ? { client: `${plural(n, 'page')} load${n === 1 ? 's' : ''} blocking files first`, expert: `${plural(n, 'page')} with render-blocking resources` } : { client: 'No blocking files', expert: '0 pages with render-blocking resources' }, 'warn'),
  },
  {
    id: '1.8.6', module: 1, category: 'speed', card: 'speed', scope: 'page', severity: 'medium',
    title: { client: 'The server responds slowly', expert: 'High server waiting time (TTFB)' },
    explain: { client: 'A slow server delays every page.', expert: 'High waiting time inflates TTFB and LCP.' },
    fix: { client: 'Turn on caching or upgrade hosting.', expert: 'Enable page caching/CDN; profile slow backend.' },
    ice: { impact: 3, confidence: 4, effort: 3 },
    evaluate: ({ ok }) => countPages(ok, (p) => p.checks?.high_waiting_time === true, (n) =>
      n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} slow to start loading`, expert: `${plural(n, 'page')} with high waiting time` } : { client: 'The server responds quickly', expert: '0 pages with high waiting time' }, 'warn'),
  },
];
