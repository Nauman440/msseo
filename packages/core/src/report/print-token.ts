/**
 * Short-lived token that lets the worker's headless browser open one audit's print page
 * without a login (to render the PDF it emails). HMAC-SHA256 over "auditId.expiry" with
 * ENCRYPTION_KEY (already shared by the web app and the worker). Web Crypto only, so it
 * also runs in the Next.js middleware (edge runtime). Imported as @seo/core/print-token.
 */
const enc = new TextEncoder();

const b64url = (bytes: ArrayBuffer) => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function keyBytes(base64Key: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64Key.trim());
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function hmac(base64Key: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes(base64Key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`msscore-print:${message}`)));
}

export async function signPrintToken(auditId: string, base64Key: string, ttlSeconds = 600, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return `${exp}.${await hmac(base64Key, `${auditId}.${exp}`)}`;
}

export async function verifyPrintToken(token: string, auditId: string, base64Key: string, now = Date.now()): Promise<boolean> {
  const [expText, sig] = token.split('.');
  const exp = Number(expText);
  if (!sig || !Number.isFinite(exp) || exp < now / 1000) return false;
  const expected = await hmac(base64Key, `${auditId}.${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
