import 'server-only';

/**
 * Cloudflare Turnstile (bot check on public free audits, step 8).
 * Server check: POST https://challenges.cloudflare.com/turnstile/v0/siteverify with
 * secret + response (+ remoteip); success is `{"success": true}`.
 * Without keys: allowed in local development, refused on servers (REQUIRE_AUTH=1),
 * so a missing setting never opens free audits to bots.
 */
export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY?.trim() || null;

export type TurnstileResult = { ok: true } | { ok: false; reason: 'not-configured' | 'failed' };

export async function verifyTurnstile(token: string | null, ip: string | null): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !turnstileSiteKey()) return process.env.REQUIRE_AUTH === '1' ? { ok: false, reason: 'not-configured' } : { ok: true };
  if (!token) return { ok: false, reason: 'failed' };
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
    const json = (await res.json()) as { success?: boolean };
    return json.success ? { ok: true } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** The visitor's IP: Cloudflare's header first (the site is proxied), then the proxy chain. */
export function clientIp(headers: Headers): string | null {
  return headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headers.get('x-real-ip') ?? null;
}
