import { request, type HttpLog } from '../providers/http';

/**
 * The client's own Google Business Profile, entered by hand (Module 9): a Google Maps link, a share
 * link (maps.app.goo.gl, g.page), a place ID (ChIJ…) or a CID. Turned into the "cid:" / "place_id:"
 * reference that DataForSEO Business Data accepts, so the audit no longer has to guess the profile
 * from a Maps search for the business name.
 */
export type ProfileRef = `cid:${string}` | `place_id:${string}`;

const SHORT = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.page|g\.co\/kgs)\//i;

/** A reference from text, or null (a short link must be resolved first: see `resolveProfileLink`). */
export function parseProfileLink(raw: string): ProfileRef | null {
  const s = decodeURIComponent(raw.trim());
  if (!s) return null;
  if (/^\d{8,22}$/.test(s)) return `cid:${s}`;
  if (/^(ChIJ|GhIJ|EiI|Ei[A-Za-z0-9])[A-Za-z0-9_-]{10,}$/.test(s)) return `place_id:${s}`;
  const pre = s.match(/^(cid|place_id):(\S+)$/);
  if (pre) return `${pre[1] as 'cid' | 'place_id'}:${pre[2]!}`;
  const cid = s.match(/[?&]cid=(\d{8,22})/);
  if (cid) return `cid:${cid[1]!}`;
  const pid = s.match(/(?:[?&](?:query_place_id|place_id|placeid)=|place_id:)([A-Za-z0-9_-]{20,})/);
  if (pid) return `place_id:${pid[1]!}`;
  // Full Maps URLs carry the feature id "0x<hex>:0x<hex>"; the second half is the CID in hex.
  const fid = s.match(/0x[0-9a-f]+:0x([0-9a-f]+)/i);
  if (fid) return `cid:${BigInt(`0x${fid[1]!}`).toString()}`;
  return null;
}

/** Follows a share link's redirects (up to 5) to the full Maps URL, then parses it. */
export async function resolveProfileLink(raw: string, log?: HttpLog): Promise<ProfileRef | null> {
  const direct = parseProfileLink(raw);
  if (direct || !SHORT.test(raw.trim())) return direct;
  let url = raw.trim();
  for (let i = 0; i < 5; i++) {
    try {
      const res = await request(url, { provider: 'site', manualRedirect: true, timeoutMs: 10_000, retries: 0, log });
      const next = res.headers.get('location');
      await res.body?.cancel().catch(() => undefined);
      if (!next) return null;
      url = new URL(next, url).toString();
      const ref = parseProfileLink(url);
      if (ref) return ref;
    } catch {
      return null;
    }
  }
  return null;
}
