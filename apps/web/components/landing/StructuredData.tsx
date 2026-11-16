import { COMPANY, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import { FAQ } from './Closing';

/**
 * Schema.org JSON-LD for the landing page: who we are (Organization), the site
 * (WebSite), the product (SoftwareApplication) and the visible FAQ (FAQPage).
 * Our own rule 1.11.1 flagged msseo.tech for having none; AI answer engines also
 * lean on these entities. Only facts shown on the page are stated — no ratings.
 */
export function StructuredData() {
  const org = `${SITE_URL}/#organization`;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: COMPANY.name,
        url: COMPANY.url,
        logo: { '@type': 'ImageObject', url: `${SITE_URL}/icons/icon-512.png`, width: 512, height: 512 },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        alternateName: 'MSScore by Morosoft',
        description: SITE_DESCRIPTION,
        publisher: { '@id': org },
        inLanguage: 'en',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#software`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        description: SITE_DESCRIPTION,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'SEO audit tool',
        operatingSystem: 'Web browser',
        publisher: { '@id': org },
        // Only the free audit is offered today; paid plans are marked "Coming soon".
        offers: { '@type': 'Offer', name: 'Free SEO audit', price: '0', priceCurrency: 'USD' },
        featureList: [
          'Technical SEO audit',
          'On-page SEO audit',
          'Core Web Vitals and mobile speed check',
          'robots.txt and sitemap.xml check',
          'AI search readiness check',
          'Prioritised fix list and health score',
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
  };
  // JSON.stringify output is safe inside <script type="application/ld+json"> once "<" is escaped.
  const json = JSON.stringify(graph).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
