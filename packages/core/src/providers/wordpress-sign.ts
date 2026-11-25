/**
 * Signed requests to the MS SCORE Connector plugin (1.1.0+). Must match
 * integrations/wordpress/msscore-connector/includes/signing.php exactly:
 *
 *   X-MSScore-Timestamp: unix seconds
 *   X-MSScore-Signature: hex HMAC-SHA256(key, ts \n METHOD \n route \n sorted query \n sha256hex(body))
 *
 * Uses Web Crypto, so it runs in Node 20 and edge runtimes without node:crypto.
 */

/** PHP rawurlencode: everything but A–Z a–z 0–9 - _ . ~ is percent-encoded. */
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Query parameters sorted by name and encoded like the plugin does (rest_route left out). */
export function wpCanonicalQuery(params: URLSearchParams | Record<string, string>): string {
  const entries = params instanceof URLSearchParams ? [...params.entries()] : Object.entries(params);
  const map = new Map<string, string>();
  for (const [k, v] of entries) if (k !== 'rest_route') map.set(k, v);
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
    .join('&');
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder();

/** The signature for one request. */
export async function wpSignature(key: string, ts: string, method: string, route: string, query: string, body: string): Promise<string> {
  const bodyHash = hex(await crypto.subtle.digest('SHA-256', enc.encode(body)));
  const base = `${ts}\n${method.toUpperCase()}\n${route}\n${query}\n${bodyHash}`;
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(base)));
}

/** Headers for a signed call to `/wp-json/<path>` (path may carry a query string). */
export async function wpSignedHeaders(key: string, method: string, path: string, body: string, now = Date.now()): Promise<Record<string, string>> {
  const [route, qs = ''] = path.split('?');
  const ts = String(Math.floor(now / 1000));
  const sig = await wpSignature(key, ts, method, `/${route!.replace(/^\/+/, '')}`, wpCanonicalQuery(new URLSearchParams(qs)), body);
  return { 'x-msscore-timestamp': ts, 'x-msscore-signature': sig };
}

/** A new random signing key (43 url-safe characters = 32 bytes). */
export function newSigningKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
