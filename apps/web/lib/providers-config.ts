import 'server-only';

/** Provider credentials (shared with apps/worker); server-only so they never reach a browser bundle. */
export { providerConfig } from '@seo/core';
