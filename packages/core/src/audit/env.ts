import type { AuditEnv } from './run';

export type ProviderStatus = { dataforseo: boolean; pagespeed: boolean; email: boolean; openai: boolean };

/**
 * Provider credentials from the environment, for the web app and the worker alike.
 * Values never leave the server; `status` only says which providers are configured.
 */
export function providerConfig(env: NodeJS.ProcessEnv = process.env): { env: AuditEnv | null; status: ProviderStatus } {
  const login = env.DATAFORSEO_LOGIN?.trim();
  const password = env.DATAFORSEO_PASSWORD?.trim();
  const baseUrl = env.DATAFORSEO_BASE_URL?.trim() || 'https://api.dataforseo.com';
  const pagespeedKey = env.PAGESPEED_API_KEY?.trim() || undefined;
  const openaiKey = env.OPENAI_API_KEY?.trim() || undefined;
  const status = {
    dataforseo: Boolean(login && password),
    pagespeed: Boolean(pagespeedKey),
    email: Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim()),
    openai: Boolean(openaiKey),
  };
  return {
    status,
    env:
      login && password
        ? {
            dataforseo: { login, password, baseUrl },
            pagespeedKey,
            openai: openaiKey ? { apiKey: openaiKey, model: env.OPENAI_MODEL?.trim() || undefined } : undefined,
            brand: 'Morosoft Technologies',
          }
        : null,
  };
}
