import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/landing/LegalPage';
import { COMPANY, SITE_URL, SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: 'Privacy Policy | MSScore by Morosoft' },
  description: 'How MSScore by Morosoft Technologies collects, uses, stores and protects data, including data from Google Search Console and Google Analytics.',
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
            <strong>Google Search Console and Google Analytics data</strong>, only when a customer connects their own Google account and chooses
            properties for their website, or when an MSScore administrator connects the team’s Google account. See section 4.
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

      <LegalSection id="google" title="4. Google user data (Search Console and Analytics)">
        <p>
          A customer can choose “Connect with Google” on their dashboard, and an MSScore administrator can connect the team’s Google account in
          Settings. Google then asks for permission to <strong>view</strong> Search Console data (scope <code>webmasters.readonly</code>), to
          <strong> view</strong> Google Analytics data (scope <code>analytics.readonly</code>, customers only) and to see the Google account’s email
          address (scopes <code>openid</code> and <code>email</code>). MSScore cannot change anything in Search Console or Google Analytics.
        </p>
        <p>
          <strong>What we access from Search Console:</strong> the list of properties the account can see; for the property chosen for a website,
          search performance data (clicks, impressions, click-through rate and average position by page and by query), the sitemaps submitted for it
          and URL Inspection results (index status) for audited pages.
        </p>
        <p>
          <strong>What we access from Google Analytics:</strong> the list of Analytics accounts and properties the account can see and the website
          address of each property’s web data stream (so the customer can pick the property for their website); for the chosen property, two totals
          for the last 28 days: sessions and key events (such as calls and form submissions).
        </p>
        <p>
          <strong>How we use it:</strong> only to show that website’s own results to the people allowed to see them: audit reports (index coverage,
          pages Google has not indexed, low click-through pages, pages losing traffic, pages competing for the same query), the customer’s dashboard
          (clicks from Google, average position, leads tracked, rankings and the weekly list of searches closest to Google’s first page) and keyword
          research for that website.
        </p>
        <p>
          <strong>Storage and protection:</strong> Google refresh tokens are stored encrypted (AES-256-GCM). Search Console results used in a report
          are stored with that audit so the report can be viewed and exported later. Dashboard figures are fetched when the dashboard is opened and
          kept in memory for up to 30 minutes; they are not stored in our database.
        </p>
        <p>
          <strong>Sharing:</strong> Google user data is not sold, not used for advertising, not used to build user profiles and not used to train
          artificial-intelligence or machine-learning models. Search Console and Analytics data are never sent to OpenAI or any other AI service:
          when AI features are used, they are left out of what is sent. A customer’s Google data is only shown to that customer and to the MSScore
          team working on their website, and in the reports they choose to download or send.
        </p>
        <p>
          <strong>Google Business Profile (optional):</strong> on a website’s Local page, the customer or the team can connect the Google account
          that manages the business’s profile. Google then asks for permission to manage Business Profiles (scope <code>business.manage</code>).
          MSScore reads the list of profiles the account manages, the chosen profile’s reviews and posts, and changes the profile only in two ways,
          each started by a person: posting the reply they wrote to a review when they press <em>Post reply</em>, and publishing the update they
          wrote when they press <em>Publish</em>. Nothing is posted automatically. When a person presses <em>Write with AI</em> on a review, that
          review’s text, star rating and the reviewer’s first name are sent to OpenAI once to draft a reply for them to edit; nothing else from the
          profile is sent. A record of each reply and post (text, date, who sent it) is kept with the website.
        </p>
        <p>
          MSScore’s use and transfer of information received from Google APIs adheres to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>
          <strong>Revoking access:</strong> customers can disconnect at any time on their dashboard under Connections, and administrators in
          Settings → Search Console; disconnecting deletes the stored token. Access can also be removed from the Google account at{' '}
          <a href="https://myaccount.google.com/permissions" rel="noopener noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="providers" title="5. Service providers">
        <p>We use these providers to run MSScore. Each receives only what it needs for its task:</p>
        <ul>
          <li>
            <strong>DataForSEO</strong>: checks the public pages of the website being audited and, for keyword research, looks up search volume,
            difficulty and Google results for keywords. These keywords can include search terms taken from that website’s Search Console, sent
            without any personal data and only to research that website.
          </li>
          <li><strong>Google PageSpeed Insights</strong>: measures page speed of public pages.</li>
          <li><strong>Google Search Console API, Google Analytics APIs and Google Business Profile APIs</strong>: as described in section 4.</li>
          <li>
            <strong>OpenAI</strong>: only when AI recommendations are turned on for an audit; receives the audit findings and page addresses (no
            Search Console or Analytics data, no passwords, no page HTML) to write a fix plan; and, when a person asks for it, one Business Profile
            review at a time to draft a reply (see section 4).
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
          <li>Google connections (Search Console, Analytics and Business Profile): until disconnected; disconnecting deletes the stored token immediately.</li>
          <li>The record of Business Profile replies and posts sent from MSScore: the latest 100 per website, until the website is removed.</li>
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
