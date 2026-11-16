import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/landing/LegalPage';
import { COMPANY, SITE_URL, SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: 'Privacy Policy | MSScore by Morosoft' },
  description: 'How MSScore by Morosoft Technologies collects, uses, stores and protects data, including data from Google Search Console.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
};

const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

/** Privacy policy (needed for the Google OAuth consent screen). Describes what the app actually does. */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This policy explains what data MSScore (msseo.tech), a website audit service operated by ${COMPANY.name}, collects, why, how it is protected and the choices you have.`}
    >
      <LegalSection id="who" title="1. Who we are">
        <p>
          MSScore (“MSScore”, “we”, “us”) is operated by {COMPANY.name}. MSScore audits websites for technical SEO, on-page SEO, speed and
          search visibility, and produces reports. Questions about this policy: {mail}.
        </p>
      </LegalSection>

      <LegalSection id="collect" title="2. Data we collect">
        <ul>
          <li>
            <strong>Account data.</strong> For people with an MSScore login: name, email address, role and a password stored only as a one-way
            hash (bcrypt). A session cookie keeps you signed in.
          </li>
          <li>
            <strong>Audit data.</strong> The website addresses you ask us to audit, the settings you choose, an optional email address to send the
            finished report to, and the results: page data read from the public website, scores, findings and reports (web, PDF and Markdown).
          </li>
          <li>
            <strong>Public website content.</strong> To audit a site we read its public pages, robots.txt and sitemaps the way a search engine would.
            We do not log in to the audited website.
          </li>
          <li>
            <strong>Google Search Console data</strong>, only when an administrator connects a Google account and chooses a property for an audit.
            See section 4.
          </li>
          <li>
            <strong>Technical logs.</strong> Server logs (time, address requested, errors) used to run and secure the service.
          </li>
        </ul>
        <p>We do not use advertising or analytics trackers, and we do not sell personal data.</p>
      </LegalSection>

      <LegalSection id="use" title="3. How we use data">
        <ul>
          <li>To run audits and show, export and email the reports you request.</li>
          <li>To sign you in, protect accounts (for example by limiting failed login attempts) and keep the service secure.</li>
          <li>To answer support requests and fix problems.</li>
        </ul>
      </LegalSection>

      <LegalSection id="google" title="4. Google user data (Search Console)">
        <p>
          If an MSScore administrator chooses “Connect Search Console”, Google asks them to allow MSScore to <strong>view</strong> Search Console data
          (scope <code>webmasters.readonly</code>) and to see the Google account’s email address (scopes <code>openid</code> and <code>email</code>).
          MSScore cannot change anything in Search Console.
        </p>
        <p>
          <strong>What we access:</strong> the list of Search Console properties the account can see; for a property selected in an audit, search
          performance data (clicks, impressions, click-through rate and average position by page and by query), the sitemaps submitted for it and
          URL Inspection results (index status) for the pages in the audit.
        </p>
        <p>
          <strong>How we use it:</strong> only to produce the audit report for that property: index coverage, pages Google has not indexed, low
          click-through pages, queries close to the top of the results, pages losing traffic and pages competing for the same query.
        </p>
        <p>
          <strong>Storage and protection:</strong> the Google refresh token is stored encrypted (AES-256-GCM). The Search Console results used in a
          report are stored with that audit in our database so the report can be viewed and exported later.
        </p>
        <p>
          <strong>Sharing:</strong> Google user data is not sold, not used for advertising, not used to build user profiles and not used to train
          artificial-intelligence or machine-learning models. It is not sent to OpenAI or any other AI service: when optional AI recommendations
          are turned on, Search Console findings are left out of what is sent. Google user data is only shown to signed-in MSScore users and in the
          reports they choose to download or send.
        </p>
        <p>
          MSScore’s use and transfer of information received from Google APIs adheres to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>
          <strong>Revoking access:</strong> an administrator can disconnect at any time in Settings → Search Console, which deletes the stored token.
          Access can also be removed from the Google account at{' '}
          <a href="https://myaccount.google.com/permissions" rel="noopener noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="providers" title="5. Service providers">
        <p>We use these providers to run MSScore. Each receives only what it needs for its task:</p>
        <ul>
          <li><strong>DataForSEO</strong>: checks the public pages of the website being audited.</li>
          <li><strong>Google PageSpeed Insights</strong>: measures page speed of public pages.</li>
          <li><strong>Google Search Console API</strong>: as described in section 4.</li>
          <li>
            <strong>OpenAI</strong>: only when AI recommendations are turned on for an audit; receives the audit findings and page addresses (no
            Search Console data, no passwords, no page HTML) to write a fix plan.
          </li>
          <li><strong>Hostinger</strong> (servers), <strong>Cloudflare</strong> (DNS, network protection and backup storage).</li>
          <li><strong>Email delivery provider</strong>: only to send a report to an address you entered.</li>
        </ul>
        <p>We may also disclose data if the law requires it.</p>
      </LegalSection>

      <LegalSection id="retention" title="6. How long we keep data">
        <ul>
          <li>Accounts: until the account is removed.</li>
          <li>Audits and reports, including any Search Console results in them: until deleted by an administrator or on request.</li>
          <li>The Search Console connection: until disconnected; disconnecting deletes the stored token immediately.</li>
          <li>Database backups, where kept: up to 14 days, then overwritten.</li>
        </ul>
      </LegalSection>

      <LegalSection id="security" title="7. Security">
        <p>
          Connections use HTTPS. Passwords are hashed, the Google token is encrypted, the app’s internal pages require a login, and the database
          and job queue are not reachable from the internet. No system is perfectly secure; if we learn of a breach affecting your data, we will
          tell you.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="8. Your choices and rights">
        <p>
          You can ask to see, correct, export or delete your personal data, or ask questions about how it is used, by emailing {mail}. We reply
          within 30 days. If you are in a country with data protection laws (for example the EU or UK GDPR), you also have the rights those laws
          give you, including complaining to your data protection authority.
        </p>
      </LegalSection>

      <LegalSection id="children" title="9. Children">
        <p>MSScore is a business tool and is not meant for children under 16. We do not knowingly collect their data.</p>
      </LegalSection>

      <LegalSection id="changes" title="10. Changes to this policy">
        <p>We will update this page when our practices change and change the “Last updated” date above. Significant changes will be announced in the app.</p>
      </LegalSection>

      <LegalSection id="contact" title="11. Contact">
        <p>
          {COMPANY.name}, operator of MSScore: {mail}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
