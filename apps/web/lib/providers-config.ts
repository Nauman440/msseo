import 'server-only';
import type { AuditEnv } from '@seo/core';

/** Reads provider credentials from the environment. Values never leave the server. */
export function providerConfig(): { env: AuditEnv | null; status: { dataforseo: boolean; pagespeed: boolean; email: boolean } } {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  const baseUrl = process.env.DATAFORSEO_BASE_URL?.trim() || 'https://api.dataforseo.com';
  const pagespeedKey = process.env.PAGESPEED_API_KEY?.trim() || undefined;
  const status = {
    dataforseo: Boolean(login && password),
    pagespeed: Boolean(pagespeedKey),
    email: Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim()),
  };
  return {
    status,
    env: login && password ? { dataforseo: { login, password, baseUrl }, pagespeedKey, brand: 'Morosoft Technologies' } : null,
  };
}
