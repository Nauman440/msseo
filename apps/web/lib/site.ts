/** Public-site constants for the landing page (one place to change them). */

/**
 * Canonical public address. The landing page is prerendered at build time, when
 * Coolify's runtime-only variables are not set, so production is the default;
 * staging therefore canonicalises to msseo.tech, which is what we want.
 */
export const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://msseo.tech').replace(/\/$/, '');
export const SITE_NAME = 'MSScore';
export const COMPANY = { name: 'Morosoft Technologies', url: 'https://morosoft.com/' };
export const SITE_DESCRIPTION =
  'MSScore is a free SEO audit tool by Morosoft. It checks technical SEO, on-page SEO, speed, mobile and AI search readiness, gives your website a health score and a prioritised list of what to fix first.';

/** Landing-page audit boxes and buttons: the public free audit (step 8). The team uses /audits/new. */
export const AUDIT_HREF = '/free';

/** "Talk to our team", "Book a call", footer Contact. */
export const CONTACT_HREF = process.env.NEXT_PUBLIC_CONTACT_URL || 'https://morosoft.com/';

/** Honest timing: a 10-page audit takes a few minutes, not 60 seconds as in the mockup. */
export const CTA_NOTE = 'Free. No card needed. Takes a few minutes.';

/** Contact for privacy, data and terms questions (shown on /privacy and /terms). */
export const SUPPORT_EMAIL = 'support@msseo.tech';
/** "Last updated" date of the privacy policy and terms; change it whenever either text changes. */
export const LEGAL_UPDATED = '23 November 2026';
