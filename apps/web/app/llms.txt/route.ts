import { COMPANY, SITE_DESCRIPTION, SITE_URL } from '@/lib/site';
import { FAQ } from '@/components/landing/Closing';

/**
 * /llms.txt (llmstxt.org): a plain-Markdown summary of the site for AI assistants and
 * answer engines (GEO/AEO). Built from the same FAQ the page shows, so it never drifts.
 */
export const dynamic = 'force-static';

export function GET() {
  const live = FAQ.filter((f) => !f.soon);
  const body = [
    '# MSScore by Morosoft',
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `MSScore is built by ${COMPANY.name} (${COMPANY.url}). The free SEO audit is available today; automatic fixes, scheduled reports, AI search tracking and paid plans are coming soon.`,
    '',
    '## What the free audit checks',
    '',
    '- Technical SEO: robots.txt, sitemap.xml, indexing (noindex/nofollow), error pages, redirects, canonical tags, domain versions, HTTPS and security headers, structured data',
    '- On-page SEO: title tags, meta descriptions, headings, thin content, image alt text',
    '- Speed and mobile: Core Web Vitals (LCP, CLS, server response time) and mobile performance score',
    '- AI search readiness: whether AI crawlers can reach the site',
    '- Output: a health score out of 100, issues ranked by priority, a PDF report and a Markdown fix list',
    '',
    '## Questions and answers',
    '',
    ...live.flatMap((f) => [`### ${f.q}`, '', f.a, '']),
    '## Links',
    '',
    `- [Run a free SEO audit](${SITE_URL}/): the MSScore homepage`,
    `- [Morosoft Technologies](${COMPANY.url}): the company behind MSScore`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
}
