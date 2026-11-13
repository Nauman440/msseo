/** Public-site constants for the landing page (one place to change them). */

/** Where audit CTAs go. The audit tool is team-only for now (public free audit comes later). */
export const AUDIT_HREF = '/audits/new';

/** "Talk to our team", "Book a call", footer Contact. */
export const CONTACT_HREF = process.env.NEXT_PUBLIC_CONTACT_URL || 'https://morosoft.com/';

/** Honest timing: a 10-page audit takes a few minutes, not 60 seconds as in the mockup. */
export const CTA_NOTE = 'Free. No card needed. Takes a few minutes.';
