import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/landing/LegalPage';
import { COMPANY, SITE_URL, SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: 'Terms of Service | MSScore by Morosoft' },
  description: 'The terms for using MSScore, the website audit service by Morosoft Technologies.',
  alternates: { canonical: '/terms' },
  robots: { index: true, follow: true },
};

const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

/** Terms of service (needed for the Google OAuth consent screen). No governing-law clause yet (user decision 2026-11-16). */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms govern your use of MSScore (msseo.tech), a website audit service operated by ${COMPANY.name}. By using MSScore you agree to them.`}
    >
      <LegalSection id="service" title="1. The service">
        <p>
          MSScore checks websites for technical SEO, on-page SEO, speed, mobile and search visibility and produces scores, findings and reports.
          Optional features can add data from Google Search Console (when a Google account is connected) and AI-written recommendations.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="2. Accounts">
        <ul>
          <li>Accounts are created by an MSScore administrator. Keep your password private; you are responsible for activity under your account.</li>
          <li>Tell us at {mail} if you think your account has been misused.</li>
          <li>We may suspend accounts that break these terms or put the service at risk.</li>
        </ul>
      </LegalSection>

      <LegalSection id="use" title="3. Acceptable use">
        <p>You agree to:</p>
        <ul>
          <li>Audit only websites you own or are authorised to audit, and connect only Search Console properties you are allowed to access.</li>
          <li>Not use MSScore to overload, attack or gain unauthorised access to any website or system.</li>
          <li>Not try to break, reverse engineer or get around the security or usage limits of MSScore.</li>
          <li>Not use MSScore for anything unlawful.</li>
        </ul>
      </LegalSection>

      <LegalSection id="google" title="4. Google Search Console">
        <p>
          Connecting Search Console gives MSScore read-only access to the properties the Google account can see. MSScore uses that data only to
          build audit reports, as described in our <Link href="/privacy#google">Privacy Policy</Link>. You can disconnect at any time in
          Settings → Search Console or from your Google account permissions. Your use of Google services is also subject to Google’s own terms.
        </p>
      </LegalSection>

      <LegalSection id="content" title="5. Your content and reports">
        <p>
          You keep all rights to your websites and data. You give us permission to process them only to provide the service. Reports are yours
          to use and share, including with your clients. The MSScore software, design and brand remain the property of {COMPANY.name}.
        </p>
      </LegalSection>

      <LegalSection id="results" title="6. Results and recommendations">
        <p>
          Audits rely on automated checks, third-party data (such as DataForSEO, Google PageSpeed Insights and Google Search Console) and, where
          turned on, AI-generated text. They can be incomplete or wrong, and search rankings depend on many factors outside anyone’s control.
          MSScore gives information and recommendations, not guarantees of rankings, traffic or revenue. Review changes before applying them to a
          live website.
        </p>
      </LegalSection>

      <LegalSection id="availability" title="7. Availability and changes">
        <p>
          We work to keep MSScore available but do not promise it will be uninterrupted or error-free. We may change, add or remove features, and
          will update these terms when needed; the “Last updated” date above shows the current version. Continuing to use MSScore after a change
          means you accept the new terms.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="8. Disclaimer and limitation of liability">
        <p>
          MSScore is provided “as is” and “as available”. To the extent the law allows, {COMPANY.name} is not liable for indirect, incidental or
          consequential losses, or for lost profits, revenue, rankings or data, arising from your use of MSScore. Nothing in these terms limits
          liability that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection id="ending" title="9. Ending use">
        <p>
          You can stop using MSScore at any time and ask us to delete your data (see the <Link href="/privacy#rights">Privacy Policy</Link>). We may
          end or suspend access if these terms are broken.
        </p>
      </LegalSection>

      <LegalSection id="privacy" title="10. Privacy">
        <p>
          How we handle personal data, including Google user data, is described in our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="11. Contact">
        <p>
          {COMPANY.name}, operator of MSScore: {mail}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
