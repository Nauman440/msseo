import type { ReportModel } from '../types';

/**
 * Demo data for /dev/components, the homepage preview and the sample PDF.
 * Shape matches what the `finalise` step will store on Audit.report.
 * The domain is fictional.
 */
export const sampleReport: ReportModel = {
  auditId: 'demo',
  brand: 'Morosoft Technologies',
  project: { name: 'Summit Air Heating & Cooling', domain: 'summitairhvac.com' },
  url: 'https://www.summitairhvac.com/',
  audience: 'client',
  pagesCrawled: 50,
  crawlLimit: 50,
  crawledAt: '2026-11-10T09:42:00Z',
  gscProperty: null,
  overall: { score: 58, label: 'Poor', afterFixes: 84 },
  categories: [
    { id: 'technical', label: 'Technical SEO', score: 52 },
    { id: 'onpage', label: 'On-page SEO', score: 61 },
    { id: 'speed', label: 'Speed and Core Web Vitals', score: 44 },
    { id: 'mobile', label: 'Mobile', score: 78 },
    { id: 'ai', label: 'AI search readiness', score: 39 },
    { id: 'trust', label: 'Trust and conversion', score: 72 },
    { id: 'security', label: 'Security', score: 88 },
  ],
  severityCounts: { critical: 3, high: 8, medium: 11, low: 6 },
  pageHealth: { healthy: 27, warnings: 15, errors: 8 },
  cwv: {
    source: 'field',
    device: 'mobile',
    metrics: [
      { id: 'lcp', label: 'Largest Contentful Paint', value: '4.6 s', threshold: 'Good ≤ 2.5 s', rating: 'poor' },
      { id: 'inp', label: 'Interaction to Next Paint', value: '240 ms', threshold: 'Good ≤ 200 ms', rating: 'needs-improvement' },
      { id: 'cls', label: 'Cumulative Layout Shift', value: '0.04', threshold: 'Good ≤ 0.1', rating: 'good' },
    ],
  },
  topIssues: [
    {
      ruleId: '1.3.2', severity: 'critical', category: 'technical',
      title: { client: 'Two service pages are hidden from Google', expert: 'noindex on key service pages' },
      sub: { client: 'AC repair and furnace installation pages tell Google not to list them.', expert: '/ac-repair/ and /furnace-installation/ return meta robots noindex,follow.' },
      ice: { impact: 5, confidence: 5, effort: 1 },
    },
    {
      ruleId: '1.6.6', severity: 'critical', category: 'technical',
      title: { client: 'Location pages copy each other', expert: 'Near-duplicate location pages' },
      sub: { client: '6 city pages share almost the same text, so Google may ignore most of them.', expert: '6 URLs in /service-area/ with ≥ 92% content similarity.' },
      ice: { impact: 5, confidence: 4, effort: 4 },
    },
    {
      ruleId: '1.5.1', severity: 'high', category: 'technical',
      title: { client: '4 pages are broken', expert: '4 internal URLs return 4xx' },
      sub: { client: 'Visitors and Google hit "page not found" from links on your own site.', expert: '4 × 404, 2 of them with ≥ 3 internal inlinks.' },
      ice: { impact: 4, confidence: 5, effort: 2 },
    },
    {
      ruleId: '1.8.1', severity: 'high', category: 'speed',
      title: { client: 'Pages load slowly on phones', expert: 'Mobile LCP 4.6 s (poor, field data)' },
      sub: { client: 'The main content takes almost 5 seconds to appear on mobile.', expert: 'CrUX origin p75 LCP 4.6 s; hero image 1.4 MB JPEG, not preloaded.' },
      ice: { impact: 4, confidence: 4, effort: 3 },
    },
    {
      ruleId: '2.8.2', severity: 'high', category: 'ai',
      title: { client: 'Service pages have no FAQs', expert: 'No FAQ section or FAQPage schema on service template' },
      sub: { client: 'AI assistants and Google prefer pages that answer common questions directly.', expert: '0 of 8 service pages contain FAQ headings, accordion markup or FAQPage.' },
      ice: { impact: 3, confidence: 4, effort: 2 },
    },
    {
      ruleId: '2.1.2', severity: 'high', category: 'onpage',
      title: { client: 'Many pages share the same title', expert: 'Duplicate <title> groups' },
      sub: { client: '12 pages use a title that another page already uses.', expert: '12 URLs across 3 duplicate-title groups.' },
      ice: { impact: 3, confidence: 5, effort: 2 },
    },
    {
      ruleId: '1.12.2', severity: 'high', category: 'technical',
      title: { client: 'Some pages have no links pointing to them', expert: 'Orphan pages in sitemap' },
      sub: { client: '5 pages are in your sitemap but nothing on the site links to them.', expert: '5 sitemap URLs with 0 internal inlinks.' },
      ice: { impact: 3, confidence: 4, effort: 2 },
    },
  ],
  robots: {
    found: true,
    rows: [
      { ruleId: '1.2.1', status: 'pass', severity: 'high', message: { client: 'robots.txt found and readable', expert: 'robots.txt 200, parsed with 0 errors' }, url: '/robots.txt' },
      { ruleId: '1.2.2', status: 'fail', severity: 'high', message: { client: 'Blocks files Google needs to see your design', expert: 'Disallow: /wp-content/plugins/ blocks 6 CSS/JS resources' } },
      { ruleId: '1.2.3', status: 'warn', severity: 'medium', message: { client: 'Does not point to your sitemap', expert: 'No Sitemap: directive' } },
    ],
    suggested: 'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nDisallow: /?s=\nDisallow: /search/\n\nSitemap: https://www.summitairhvac.com/sitemap_index.xml',
  },
  sitemap: {
    found: true,
    url: '/sitemap_index.xml',
    rows: [
      { ruleId: '1.4.1', status: 'pass', severity: 'high', message: { client: 'Sitemap found and valid', expert: 'sitemap_index.xml 200, 4 child sitemaps, valid XML' } },
      { ruleId: '1.4.3', status: 'fail', severity: 'high', message: { client: '8 links in the sitemap are broken or redirect', expert: '5 × 301, 2 × 404, 1 × noindex in sitemap' } },
      { ruleId: '1.4.4', status: 'warn', severity: 'medium', message: { client: '6 good pages are missing from the sitemap', expert: '6 indexable URLs (14%) absent from sitemap' } },
    ],
    segments: [
      { label: 'Valid', value: 36, tone: 'pass' },
      { label: 'Redirect', value: 5, tone: 'warn' },
      { label: '404 / noindex', value: 3, tone: 'fail' },
    ],
  },
  cards: [
    {
      id: 'errors', title: 'Error pages', section: 'technical',
      chart: { kind: 'hbar', rows: [
        { label: '200', value: 41, tone: 'pass' },
        { label: '301', value: 4, tone: 'primary' },
        { label: '404', value: 4, tone: 'fail' },
        { label: '500', value: 1, tone: 'fail' },
      ] },
      rows: [
        { ruleId: '1.5.1', status: 'fail', severity: 'high', affectedCount: 4, message: { client: '4 broken pages', expert: '4 URLs return 404' }, url: '/services/duct-cleaning-old/' },
        { ruleId: '1.5.2', status: 'fail', severity: 'high', affectedCount: 1, message: { client: '1 page shows a server error', expert: '1 URL returns 500' }, url: '/wp-json/booking/v1/slots' },
        { ruleId: '1.5.3', status: 'warn', severity: 'medium', affectedCount: 2, message: { client: '2 links bounce through several redirects', expert: '2 redirect chains ≥ 3 hops, 0 loops' } },
      ],
    },
    {
      id: 'canonical', title: 'Canonical tags', section: 'technical',
      chart: { kind: 'stacked', segments: [
        { label: 'Self-canonical', value: 31, tone: 'pass' },
        { label: 'Missing', value: 10, tone: 'warn' },
        { label: 'Points elsewhere', value: 4, tone: 'fail' },
      ] },
      rows: [
        { ruleId: '1.6.1', status: 'warn', severity: 'high', affectedCount: 10, message: { client: '10 pages do not say which version is the main one', expert: '10 indexable pages without rel=canonical' } },
        { ruleId: '1.6.2', status: 'fail', severity: 'high', affectedCount: 4, message: { client: '4 pages point Google to a broken page', expert: '4 canonicals target 3xx/4xx URLs' }, url: '/blog/page/2/' },
      ],
    },
    {
      id: 'domains', title: 'Domain variants', section: 'technical',
      rows: [
        { ruleId: '1.6.3', status: 'pass', severity: 'high', message: { client: 'All versions of your address lead to one site', expert: '3 variants 301 → https://www.summitairhvac.com/' } },
        { ruleId: '1.10.1', status: 'pass', severity: 'critical', message: { client: 'Secure connection (HTTPS) is working', expert: 'TLS valid, expires 2027-03-02 (Let’s Encrypt)' } },
      ],
    },
    {
      id: 'depth', title: 'Click depth', section: 'technical',
      chart: { kind: 'hbar', rows: [
        { label: '1 click', value: 6, tone: 'pass' },
        { label: '2 clicks', value: 24, tone: 'pass' },
        { label: '3 clicks', value: 14, tone: 'warn' },
        { label: '4+ clicks', value: 6, tone: 'fail' },
      ] },
      rows: [
        { ruleId: '1.12.1', status: 'warn', severity: 'high', affectedCount: 3, message: { client: '3 important pages are hard to reach', expert: '3 key pages at depth > 3' }, url: '/service-area/castle-rock/' },
      ],
    },
    {
      id: 'schema', title: 'Structured data', section: 'technical',
      rows: [
        { ruleId: '1.11.1', status: 'fail', severity: 'high', message: { client: 'Service pages lack business details Google can read', expert: 'Service template: no Service schema; BreadcrumbList missing site-wide' } },
        { ruleId: '1.11.2', status: 'pass', severity: 'medium', message: { client: 'Existing business details are valid', expert: 'LocalBusiness on / validates, 0 errors' } },
      ],
    },
    {
      id: 'redirects', title: 'Redirect chains', section: 'technical', expertOnly: true,
      rows: [
        { ruleId: '1.5.4', status: 'warn', severity: 'medium', affectedCount: 2, message: { client: 'Temporary redirects in use', expert: '2 internal 302s that persist' }, url: '/specials/ → /coupons/' },
      ],
    },
    {
      id: 'titles', title: 'Title tags', section: 'onpage',
      chart: { kind: 'stacked', segments: [
        { label: '50–60 chars', value: 18, tone: 'pass' },
        { label: 'Too short', value: 11, tone: 'warn' },
        { label: 'Too long', value: 15, tone: 'high' },
        { label: 'Missing', value: 2, tone: 'fail' },
      ] },
      rows: [
        { ruleId: '2.1.1', status: 'fail', severity: 'high', affectedCount: 2, message: { client: '2 pages have no title', expert: '2 indexable pages missing <title>' } },
        { ruleId: '2.1.2', status: 'fail', severity: 'high', affectedCount: 12, message: { client: '12 pages share a title with another page', expert: '3 duplicate-title groups (12 URLs)' } },
        { ruleId: '2.1.5', status: 'warn', severity: 'medium', affectedCount: 3, message: { client: '3 city pages do not mention the city in the title', expert: '3 location pages: city absent from <title>' } },
      ],
    },
    {
      id: 'meta', title: 'Meta descriptions', section: 'onpage',
      chart: { kind: 'stacked', segments: [
        { label: '140–160 chars', value: 11, tone: 'pass' },
        { label: 'Wrong length', value: 21, tone: 'warn' },
        { label: 'Missing', value: 14, tone: 'fail' },
      ] },
      rows: [
        { ruleId: '2.2.1', status: 'fail', severity: 'medium', affectedCount: 14, message: { client: '14 pages have no search snippet text', expert: '14 missing meta descriptions, 2 duplicate groups' } },
      ],
    },
    {
      id: 'headings', title: 'Headings', section: 'onpage',
      rows: [
        { ruleId: '2.3.1', status: 'warn', severity: 'medium', affectedCount: 9, message: { client: '9 pages have no main heading or several', expert: '6 pages with 0 H1, 3 with > 1 H1' } },
        { ruleId: '2.3.5', status: 'warn', severity: 'low', affectedCount: 46, message: { client: 'Headings used for buttons like "Call now"', expert: '"Call Now" H2 repeated site-wide on 46 pages' } },
      ],
    },
    {
      id: 'content', title: 'Content', section: 'onpage',
      rows: [
        { ruleId: '2.4.9', status: 'fail', severity: 'high', affectedCount: 11, message: { client: '11 pages have very little text', expert: '11 indexable pages < 300 words' }, url: '/service-area/parker/' },
        { ruleId: '2.4.10', status: 'warn', severity: 'medium', affectedCount: 2, message: { client: '2 pages mention outdated offers', expert: '2 pages reference 2023 rebates or R-22' } },
      ],
    },
    {
      id: 'images', title: 'Image alt text', section: 'onpage',
      chart: { kind: 'stacked', segments: [
        { label: 'Has alt text', value: 142, tone: 'pass' },
        { label: 'Duplicate alt', value: 28, tone: 'warn' },
        { label: 'Missing alt', value: 51, tone: 'fail' },
      ] },
      rows: [
        { ruleId: '2.5.2', status: 'fail', severity: 'medium', affectedCount: 51, message: { client: '51 images have no description', expert: '51 content images with empty/missing alt' } },
      ],
    },
    {
      id: 'trust', title: 'Trust signals', section: 'onpage',
      rows: [
        { ruleId: '2.7.1', status: 'pass', severity: 'medium', message: { client: 'Customer reviews are shown', expert: 'Review widget + AggregateRating on / and service template' } },
        { ruleId: '2.7.2', status: 'warn', severity: 'high', message: { client: 'Licence and insurance not mentioned on service pages', expert: 'No licen[cs]e/insured/NATE terms on service template' } },
        { ruleId: '2.7.6', status: 'pass', severity: 'medium', message: { client: 'Tap-to-call works on mobile', expert: 'tel: link site-wide; contact form 4 fields' } },
      ],
    },
  ],
};
