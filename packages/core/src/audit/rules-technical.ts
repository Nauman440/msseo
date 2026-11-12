import { countPages, plural, type RuleDef } from './types';

const check = (p: { checks?: Record<string, boolean | null> | null }, key: string) => p.checks?.[key] === true;
const SECURITY_HEADERS = ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy'];

/** Module 1 rules evaluated from preflight + DataForSEO crawl + PageSpeed (§6.2). */
export const technicalRules: RuleDef[] = [
  {
    id: '1.2.1', module: 1, category: 'technical', card: 'robots', scope: 'site', severity: 'high',
    title: { client: 'robots.txt file', expert: 'robots.txt exists and is valid' },
    explain: { client: 'This file tells search engines which parts of the site they may visit.', expert: 'Missing robots.txt means no crawl directives and no sitemap hint.' },
    fix: { client: 'Add a robots.txt file at the root of the site.', expert: 'Serve /robots.txt with 200 and a User-agent: * group.' },
    ice: { impact: 3, confidence: 5, effort: 1 },
    evaluate: ({ data }) => {
      const r = data.preflight.robots;
      return r.found
        ? { status: 'pass', message: { client: 'robots.txt found and readable', expert: `robots.txt ${r.status}, ${r.disallowAll.length} Disallow rules for *` } }
        : { status: 'fail', message: { client: 'No robots.txt file found', expert: `robots.txt returned ${r.status || 'no response'}` } };
    },
  },
  {
    id: '1.2.2', module: 1, category: 'technical', card: 'robots', scope: 'site', severity: 'critical',
    title: { client: 'Homepage blocked from Google', expert: 'Key pages disallowed in robots.txt' },
    explain: { client: 'If the homepage is blocked, Google cannot read the site properly.', expert: 'Disallow: / (or matching root) for User-agent: * blocks crawling of key pages.' },
    fix: { client: 'Remove the rule that blocks the whole site.', expert: 'Remove `Disallow: /` from the * group.' },
    ice: { impact: 5, confidence: 5, effort: 1 },
    evaluate: ({ data }) => {
      const blocked = data.preflight.robots.disallowAll.some((d) => d === '/' || d === '/*');
      return blocked
        ? { status: 'fail', message: { client: 'robots.txt blocks the whole site from Google', expert: 'Disallow: / for User-agent: *' } }
        : { status: 'pass', message: { client: 'Important pages are not blocked', expert: 'No root Disallow for User-agent: *' } };
    },
  },
  {
    id: '1.2.3', module: 1, category: 'technical', card: 'robots', scope: 'site', severity: 'medium',
    title: { client: 'robots.txt does not point to the sitemap', expert: 'No Sitemap: directive in robots.txt' },
    explain: { client: 'Pointing to the sitemap helps search engines find every page.', expert: 'Sitemap: directive aids discovery for all crawlers.' },
    fix: { client: 'Add the sitemap address to robots.txt.', expert: 'Append `Sitemap: <absolute sitemap URL>`.' },
    ice: { impact: 2, confidence: 5, effort: 1 },
    evaluate: ({ data }) => {
      const r = data.preflight.robots;
      if (!r.found) return null;
      return r.sitemaps.length
        ? { status: 'pass', message: { client: 'robots.txt points to the sitemap', expert: `Sitemap: ${r.sitemaps[0]}` } }
        : { status: 'warn', message: { client: 'robots.txt does not point to the sitemap', expert: 'No Sitemap: directive' } };
    },
  },
  {
    id: '1.2.4', module: 1, category: 'technical', card: 'robots', scope: 'site', severity: 'critical',
    title: { client: 'Google is blocked by the server', expert: 'Googlebot UA blocked (firewall/CDN)' },
    explain: { client: 'Some security tools block Google by mistake, which removes the site from search.', expert: 'Googlebot user agent receives a non-200 while a browser UA gets 200.' },
    fix: { client: 'Ask the host to allow Google’s crawler.', expert: 'Whitelist verified Googlebot in the WAF/CDN bot rules.' },
    ice: { impact: 5, confidence: 4, effort: 2 },
    evaluate: ({ data }) => {
      const browser = data.preflight.botAccess.find((b) => b.ua === 'browser')?.status ?? 0;
      const google = data.preflight.botAccess.find((b) => b.ua === 'googlebot')?.status ?? 0;
      if (browser >= 400 || browser === 0) return null;
      return google >= 400 || google === 0
        ? { status: 'fail', message: { client: 'The server blocks Google’s crawler', expert: `Googlebot UA → ${google || 'no response'}, browser UA → ${browser}` } }
        : { status: 'pass', message: { client: 'Google can reach the site', expert: `Googlebot UA → ${google}` } };
    },
  },
  {
    id: '1.3.2', module: 1, category: 'technical', card: 'indexing', scope: 'site', severity: 'critical',
    title: { client: 'Your homepage is hidden from Google', expert: 'noindex/nofollow on the homepage' },
    explain: { client: 'A setting on the homepage tells Google not to list it in search results, so people cannot find the site.', expert: 'meta robots / X-Robots-Tag noindex removes the page from the index; nofollow stops link discovery.' },
    fix: { client: 'Turn off the “discourage search engines” / “noindex” setting on the homepage.', expert: 'Remove noindex/nofollow from the homepage meta robots (check SEO plugin and WordPress “Search engine visibility”).' },
    ice: { impact: 5, confidence: 5, effort: 1 },
    evaluate: ({ data }) => {
      const d = data.preflight.homepage.robotsDirectives;
      const noindex = d.includes('noindex') || d.includes('none');
      const nofollow = d.includes('nofollow') || d.includes('none');
      if (noindex || nofollow) {
        const what = [noindex && 'noindex', nofollow && 'nofollow'].filter(Boolean).join(', ');
        return {
          status: 'fail',
          message: {
            client: noindex ? 'Your homepage tells Google not to show it in search results' : 'Your homepage tells Google not to follow its links',
            expert: `Homepage robots directives: ${what}`,
          },
        };
      }
      return { status: 'pass', message: { client: 'Your homepage can appear in Google', expert: d.length ? `Homepage robots: ${d.join(', ')}` : 'No restrictive robots directives on the homepage' } };
    },
  },
  {
    id: '1.4.1', module: 1, category: 'technical', card: 'sitemap', scope: 'site', severity: 'high',
    title: { client: 'No sitemap found', expert: 'XML sitemap missing or invalid' },
    explain: { client: 'A sitemap lists every page so search engines don’t miss any.', expert: 'No valid urlset/sitemapindex at robots.txt Sitemap: or conventional paths.' },
    fix: { client: 'Create a sitemap (most SEO plugins do this automatically).', expert: 'Generate sitemap_index.xml and reference it in robots.txt.' },
    ice: { impact: 3, confidence: 5, effort: 1 },
    evaluate: ({ data }) => {
      const valid = data.preflight.sitemaps.filter((s) => s.valid);
      return valid.length
        ? { status: 'pass', message: { client: `Sitemap found with ${plural(data.preflight.sitemapUrlTotal, 'page')}`, expert: `${valid.length} valid sitemap file(s), ${data.preflight.sitemapUrlTotal} URLs` } }
        : { status: 'fail', message: { client: 'No sitemap found', expert: 'No valid XML sitemap at robots.txt, /sitemap.xml or /sitemap_index.xml' } };
    },
  },
  {
    id: '1.4.3', module: 1, category: 'technical', card: 'sitemap', scope: 'page', severity: 'high',
    title: { client: 'Sitemap lists broken or moved pages', expert: 'Non-200 URLs in sitemap' },
    explain: { client: 'Search engines waste time on links in the sitemap that don’t work.', expert: 'Sitemaps should list only 200, indexable, canonical URLs.' },
    fix: { client: 'Remove broken and redirected links from the sitemap.', expert: 'Drop 3xx/4xx/5xx URLs from the sitemap; regenerate.' },
    ice: { impact: 3, confidence: 5, effort: 2 },
    evaluate: ({ data }) => {
      const checks = data.preflight.sitemapUrlChecks;
      if (!checks.length) return null;
      const bad = checks.filter((c) => c.status !== 200);
      const redirects = bad.filter((c) => c.status >= 300 && c.status < 400).length;
      return {
        status: bad.length ? 'fail' : 'pass',
        affected: bad.map((c) => c.url),
        applicable: checks.length,
        message: bad.length
          ? { client: `${plural(bad.length, 'link')} in the sitemap ${bad.length === 1 ? 'is' : 'are'} broken or redirect`, expert: `${redirects} × 3xx, ${bad.length - redirects} × 4xx/5xx of ${checks.length} sampled sitemap URLs` }
          : { client: 'Every sitemap link works', expert: `${checks.length} sampled sitemap URLs return 200` },
      };
    },
  },
  {
    id: '1.4.4', module: 1, category: 'technical', card: 'sitemap', scope: 'page', severity: 'medium',
    title: { client: 'Pages missing from the sitemap', expert: 'Crawled 200 pages absent from sitemap' },
    explain: { client: 'Pages left out of the sitemap can be found later or not at all.', expert: 'Indexable URLs missing from the sitemap reduce discovery signals.' },
    fix: { client: 'Make sure the sitemap includes every important page.', expert: 'Include all canonical 200 URLs in the sitemap.' },
    ice: { impact: 2, confidence: 4, effort: 2 },
    evaluate: ({ data, ok }) => {
      const inSitemap = new Set(data.preflight.sitemaps.flatMap((s) => s.urls).map((u) => u.replace(/\/$/, '')));
      if (!inSitemap.size) return null;
      return countPages(ok, (p) => !inSitemap.has(p.url.replace(/\/$/, '')), (n) =>
        n ? { client: `${plural(n, 'page')} missing from the sitemap`, expert: `${n} crawled 200 URLs not in sitemap` } : { client: 'All crawled pages are in the sitemap', expert: 'All crawled 200 URLs present in sitemap' }, 'warn');
    },
  },
  {
    id: '1.5.1', module: 1, category: 'technical', card: 'errors', scope: 'page', severity: 'high',
    title: { client: 'Broken pages', expert: 'Internal URLs returning 4xx' },
    explain: { client: 'Visitors and Google hit “page not found” from links on your own site.', expert: '4xx targets waste crawl budget and leak link equity.' },
    fix: { client: 'Fix or redirect the broken pages.', expert: '301 removed URLs to the closest live page; fix internal links.' },
    ice: { impact: 4, confidence: 5, effort: 2 },
    evaluate: ({ html }) => countPages(html, (p) => p.status_code >= 400 && p.status_code < 500, (n) =>
      n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} broken`, expert: `${n} URLs return 4xx` } : { client: 'No broken pages found', expert: '0 URLs return 4xx' }),
  },
  {
    id: '1.5.2', module: 1, category: 'technical', card: 'errors', scope: 'page', severity: 'high',
    title: { client: 'Server errors', expert: 'URLs returning 5xx' },
    explain: { client: 'Server errors stop pages from loading at all.', expert: '5xx responses signal instability and reduce crawl rate.' },
    fix: { client: 'Ask the developer or host to fix the server errors.', expert: 'Investigate server logs for the failing routes.' },
    ice: { impact: 4, confidence: 5, effort: 3 },
    evaluate: ({ html }) => countPages(html, (p) => p.status_code >= 500, (n) =>
      n ? { client: `${plural(n, 'page')} show${n === 1 ? 's' : ''} a server error`, expert: `${n} URLs return 5xx` } : { client: 'No server errors', expert: '0 URLs return 5xx' }),
  },
  {
    id: '1.5.3', module: 1, category: 'technical', card: 'errors', scope: 'page', severity: 'medium',
    title: { client: 'Links bounce through several redirects', expert: 'Redirect chains' },
    explain: { client: 'Each extra redirect slows pages and weakens them in search.', expert: 'Chains dilute signals and add latency.' },
    fix: { client: 'Point links straight at the final page.', expert: 'Collapse chains to a single 301.' },
    ice: { impact: 2, confidence: 5, effort: 2 },
    evaluate: ({ data }) => countPages(data.pages, (p) => check(p, 'redirect_chain'), (n) =>
      n ? { client: `${plural(n, 'link')} bounce${n === 1 ? 's' : ''} through several redirects`, expert: `${n} redirect chains` } : { client: 'No redirect chains', expert: '0 redirect chains' }, 'warn'),
  },
  {
    id: '1.5.5', module: 1, category: 'technical', card: 'errors', scope: 'page', severity: 'medium',
    title: { client: 'Internal links point to redirects', expert: 'Internal links to redirected URLs' },
    explain: { client: 'Links that go through redirects are slower and pass less value.', expert: 'Update internal links to final destinations.' },
    fix: { client: 'Update links to point to the final page.', expert: 'Replace links to 3xx URLs with their targets.' },
    ice: { impact: 2, confidence: 5, effort: 2 },
    evaluate: ({ ok }) => countPages(ok, (p) => check(p, 'has_links_to_redirects'), (n) =>
      n ? { client: `${plural(n, 'page')} link${n === 1 ? 's' : ''} to redirected pages`, expert: `${n} pages with links to 3xx URLs` } : { client: 'Internal links go straight to pages', expert: '0 pages link to redirects' }, 'warn'),
  },
  {
    id: '1.6.1', module: 1, category: 'technical', card: 'canonical', scope: 'page', severity: 'high',
    title: { client: 'Pages don’t say which version is the main one', expert: 'Missing rel=canonical' },
    explain: { client: 'Without this tag, Google may pick the wrong version of a page.', expert: 'Self-referencing canonicals consolidate duplicate URL variants.' },
    fix: { client: 'Add a canonical tag to every page (SEO plugins do this).', expert: 'Emit self-referencing rel=canonical on all indexable pages.' },
    ice: { impact: 3, confidence: 5, effort: 1 },
    evaluate: ({ ok }) => countPages(ok, (p) => !p.meta?.canonical, (n) =>
      n ? { client: `${plural(n, 'page')} ${n === 1 ? 'does' : 'do'} not say which version is the main one`, expert: `${n} pages without rel=canonical` } : { client: 'Every page has a canonical tag', expert: 'rel=canonical present on all 200 pages' }, 'warn'),
  },
  {
    id: '1.6.2', module: 1, category: 'technical', card: 'canonical', scope: 'page', severity: 'high',
    title: { client: 'Pages point Google to a broken or moved page', expert: 'Canonical targets redirect/broken/loop' },
    explain: { client: 'Google may ignore pages whose main-version tag points somewhere broken.', expert: 'Canonical must target a 200, indexable URL.' },
    fix: { client: 'Point the canonical tag at a working page.', expert: 'Fix canonicals to 3xx/4xx/recursive targets.' },
    ice: { impact: 4, confidence: 5, effort: 2 },
    evaluate: ({ ok }) => countPages(ok, (p) => check(p, 'canonical_to_broken') || check(p, 'canonical_to_redirect') || check(p, 'recursive_canonical'), (n) =>
      n ? { client: `${plural(n, 'page')} point${n === 1 ? 's' : ''} Google to a broken or moved page`, expert: `${n} canonicals to 3xx/4xx or recursive` } : { client: 'Canonical tags point to working pages', expert: 'All canonicals target 200 URLs' }),
  },
  {
    id: '1.6.3', module: 1, category: 'technical', card: 'domains', scope: 'site', severity: 'high',
    title: { client: 'Several versions of the site are live', expert: 'Domain variants not consolidated' },
    explain: { client: 'If both www and non-www (or http) versions load, Google may split the site in two.', expert: 'Exactly one host/protocol variant should return 200; others 301.' },
    fix: { client: 'Redirect every version of the address to one.', expert: '301 http and alternate host to the preferred https origin.' },
    ice: { impact: 4, confidence: 5, effort: 1 },
    evaluate: ({ data }) => {
      const live = data.preflight.variants.filter((v) => v.status === 200);
      return live.length <= 1
        ? { status: 'pass', message: { client: 'All versions of your address lead to one site', expert: `Variants redirect to ${data.preflight.origin}` } }
        : { status: 'fail', affected: live.map((v) => v.url), message: { client: `${live.length} versions of your address load separately`, expert: `${live.length} variants return 200: ${live.map((v) => v.url).join(', ')}` } };
    },
  },
  {
    id: '1.7.1', module: 1, category: 'technical', card: 'urls', scope: 'page', severity: 'low',
    title: { client: 'Hard-to-read page addresses', expert: 'Non-SEO-friendly URLs' },
    explain: { client: 'Short, readable addresses are easier to share and understand.', expert: 'Long, parameterised or uppercase URLs reduce clarity.' },
    fix: { client: 'Use short addresses with words, not numbers.', expert: 'Use lowercase, hyphenated, keyword slugs.' },
    ice: { impact: 1, confidence: 4, effort: 3 },
    evaluate: ({ ok }) => countPages(ok, (p) => p.checks?.seo_friendly_url === false, (n) =>
      n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} a hard-to-read address`, expert: `${n} URLs fail seo_friendly_url` } : { client: 'Page addresses are clean', expert: 'All URLs pass seo_friendly_url' }, 'warn'),
  },
  {
    id: '1.10.1', module: 1, category: 'security', card: 'domains', scope: 'site', severity: 'critical',
    title: { client: 'Secure connection (HTTPS) problem', expert: 'HTTPS / TLS certificate' },
    explain: { client: 'Browsers warn visitors away from sites without a valid security certificate.', expert: 'Invalid or expiring TLS breaks trust and rankings.' },
    fix: { client: 'Renew or install the security certificate.', expert: 'Fix the TLS certificate; enable auto-renewal.' },
    ice: { impact: 5, confidence: 5, effort: 1 },
    evaluate: ({ data }) => {
      const ssl = data.summary?.domain_info?.ssl_info;
      const https = data.preflight.origin.startsWith('https:');
      if (!https) return { status: 'fail', message: { client: 'The site does not use a secure connection', expert: `Final origin is ${data.preflight.origin}` } };
      if (ssl?.valid_certificate === false) return { status: 'fail', message: { client: 'The security certificate is not valid', expert: `Invalid certificate (${ssl.certificate_issuer ?? 'unknown issuer'})` } };
      const expires = ssl?.certificate_expiration_date ? new Date(ssl.certificate_expiration_date) : null;
      const days = expires ? Math.round((expires.getTime() - Date.now()) / 86_400_000) : null;
      if (days !== null && days < 30) return { status: 'warn', message: { client: `Security certificate expires in ${days} days`, expert: `TLS expires ${expires!.toISOString().slice(0, 10)}` } };
      return { status: 'pass', message: { client: 'Secure connection (HTTPS) is working', expert: expires ? `TLS valid, expires ${expires.toISOString().slice(0, 10)}${ssl?.certificate_issuer ? ` (${ssl.certificate_issuer})` : ''}` : 'HTTPS origin' } };
    },
  },
  {
    id: '1.10.2', module: 1, category: 'security', card: 'domains', scope: 'page', severity: 'low',
    title: { client: 'Pages link to insecure addresses', expert: 'HTTPS pages linking to HTTP' },
    explain: { client: 'Links to insecure versions can trigger browser warnings.', expert: 'https_to_http_links: mixed protocol links.' },
    fix: { client: 'Update links to use https://.', expert: 'Rewrite http:// links to https://.' },
    ice: { impact: 1, confidence: 5, effort: 2 },
    evaluate: ({ ok }) => countPages(ok, (p) => check(p, 'https_to_http_links'), (n) =>
      n ? { client: `${plural(n, 'page')} link${n === 1 ? 's' : ''} to insecure addresses`, expert: `${n} pages with https→http links` } : { client: 'No insecure links', expert: '0 https→http links' }, 'warn'),
  },
  {
    id: '1.10.3', module: 1, category: 'security', card: 'domains', scope: 'site', severity: 'low',
    title: { client: 'Missing security settings', expert: 'Security headers' },
    explain: { client: 'Standard security settings protect visitors and show the site is maintained.', expert: 'HSTS, X-Content-Type-Options, X-Frame-Options/CSP, Referrer-Policy.' },
    fix: { client: 'Ask the host to turn on standard security headers.', expert: 'Add the missing response headers at the server/CDN.' },
    ice: { impact: 1, confidence: 5, effort: 1 },
    evaluate: ({ data }) => {
      const h = data.preflight.homepage.headers;
      const csp = h['content-security-policy'] ?? '';
      const missing = SECURITY_HEADERS.filter((k) => !(k in h) && !(k === 'x-frame-options' && csp.includes('frame-ancestors')));
      return missing.length
        ? { status: 'warn', metrics: { missing: missing.length }, message: { client: `${plural(missing.length, 'security setting')} missing`, expert: `Missing: ${missing.join(', ')}` } }
        : { status: 'pass', message: { client: 'Security settings are in place', expert: 'All recommended security headers present' } };
    },
  },
  {
    id: '1.11.1', module: 1, category: 'technical', card: 'schema', scope: 'page', severity: 'high',
    title: { client: 'Pages lack business details Google can read', expert: 'No structured data (schema.org)' },
    explain: { client: 'Structured data helps Google show rich results like ratings and opening hours.', expert: 'No JSON-LD/microdata detected.' },
    fix: { client: 'Add business details (schema) to key pages.', expert: 'Add Organization/LocalBusiness, Service, BreadcrumbList JSON-LD.' },
    ice: { impact: 3, confidence: 4, effort: 2 },
    evaluate: ({ ok }) => countPages(ok, (p) => p.checks?.has_micromarkup === false, (n, total) =>
      n ? { client: `${plural(n, 'page')} of ${total} ${n === 1 ? 'has' : 'have'} no business details for Google`, expert: `${n}/${total} pages without structured data` } : { client: 'Every page has structured data', expert: 'Structured data on all 200 pages' }, schemaCoverageStatus(ok)),
  },
  {
    id: '1.11.2', module: 1, category: 'technical', card: 'schema', scope: 'page', severity: 'medium',
    title: { client: 'Business details contain errors', expert: 'Structured data validation errors' },
    explain: { client: 'Errors stop Google from using your business details.', expert: 'Invalid markup is ignored for rich results.' },
    fix: { client: 'Fix the errors in the structured data.', expert: 'Resolve schema validation errors.' },
    ice: { impact: 2, confidence: 4, effort: 2 },
    evaluate: ({ ok }) => countPages(ok, (p) => check(p, 'has_micromarkup_errors'), (n) =>
      n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} errors in business details`, expert: `${n} pages with schema errors` } : { client: 'Business details are valid', expert: '0 schema validation errors' }, 'warn'),
  },
  {
    id: '1.12.1', module: 1, category: 'technical', card: 'depth', scope: 'page', severity: 'high',
    title: { client: 'Pages are hard to reach', expert: 'Pages deeper than 3 clicks' },
    explain: { client: 'Pages buried deep in the site get visited less by people and Google.', expert: 'Click depth > 3 lowers crawl frequency and internal authority.' },
    fix: { client: 'Link important pages from the menu or homepage.', expert: 'Flatten architecture; add hub/nav links.' },
    ice: { impact: 3, confidence: 4, effort: 2 },
    evaluate: ({ ok }) => countPages(ok, (p) => (p.click_depth ?? 0) > 3, (n) =>
      n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} hard to reach`, expert: `${n} pages at depth > 3` } : { client: 'Every page is within 3 clicks', expert: 'Max depth ≤ 3' }, 'warn'),
  },
  {
    id: '1.12.2', module: 1, category: 'technical', card: 'depth', scope: 'page', severity: 'high',
    title: { client: 'Pages with no links pointing to them', expert: 'Orphan pages' },
    explain: { client: 'Pages that nothing links to are hard for Google to find and value.', expert: 'Orphans (in sitemap, 0 inlinks) receive no internal equity.' },
    fix: { client: 'Link to these pages from related pages.', expert: 'Add contextual internal links to orphan URLs.' },
    ice: { impact: 3, confidence: 4, effort: 2 },
    evaluate: ({ ok }) => countPages(ok, (p) => check(p, 'is_orphan_page'), (n) =>
      n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} no links pointing to ${n === 1 ? 'it' : 'them'}`, expert: `${n} orphan pages` } : { client: 'Every page is linked from the site', expert: '0 orphan pages' }),
  },
];

/** Partial schema coverage is a warning; none at all is a failure. */
function schemaCoverageStatus(pages: { checks?: Record<string, boolean | null> | null }[]): 'warn' | 'fail' {
  return pages.some((p) => p.checks?.has_micromarkup === true) ? 'warn' : 'fail';
}
