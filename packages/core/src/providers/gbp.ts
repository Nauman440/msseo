import { z } from 'zod';
import { request, requestJson, type HttpLog } from './http';

/**
 * Google Business Profile APIs (OAuth scope business.manage), checked against developers.google.com
 * on 2026-11-19. Google must approve the Cloud project first (GBP API contact form, "Application for
 * Basic API Access"); until then every call answers with a quota of 0 and fails.
 *  - Account Management  GET  https://mybusinessaccountmanagement.googleapis.com/v1/accounts (pageSize ≤ 20)
 *  - Business Information GET https://mybusinessbusinessinformation.googleapis.com/v1/{accounts/*}/locations?readMask=…
 *      Location: name ("locations/{id}"), title, websiteUri, phoneNumbers.primaryPhone, metadata.mapsUri / placeId
 *  - Reviews (v4)        GET  https://mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/reviews (pageSize ≤ 50)
 *                        PUT  …/reviews/{reviewId}/reply  { comment }   ·   DELETE …/reviews/{reviewId}/reply
 *  - Posts (v4)          POST …/accounts/{a}/locations/{l}/localPosts  { languageCode, summary, topicType: STANDARD, callToAction }
 *                        GET  …/localPosts (list)
 */
export const GBP_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/business.manage'];
const ACCOUNTS = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const INFO = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const V4 = 'https://mybusiness.googleapis.com/v4';
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const opts = (token: string, log?: HttpLog) => ({ provider: 'gbp', headers: auth(token), timeoutMs: 20_000, retries: 1, log });

export type GbpLocation = { account: string; accountName: string; location: string; title: string; website: string | null; phone: string | null; mapsUri: string | null; placeId: string | null };

export async function listGbpLocations(token: string, log?: HttpLog): Promise<GbpLocation[]> {
  const accounts: { name: string; accountName: string }[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 10; i++) {
    const qs = new URLSearchParams({ pageSize: '20', ...(pageToken ? { pageToken } : {}) });
    const j = z
      .object({ accounts: z.array(z.object({ name: z.string(), accountName: z.string().optional() })).optional(), nextPageToken: z.string().optional() })
      .parse(await requestJson(`${ACCOUNTS}/accounts?${qs}`, opts(token, log)));
    accounts.push(...(j.accounts ?? []).map((a) => ({ name: a.name, accountName: a.accountName ?? a.name })));
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  const loc = z.object({
    name: z.string(),
    title: z.string().optional(),
    websiteUri: z.string().optional(),
    phoneNumbers: z.object({ primaryPhone: z.string().optional() }).optional(),
    metadata: z.object({ mapsUri: z.string().optional(), placeId: z.string().optional() }).optional(),
  });
  const out: GbpLocation[] = [];
  for (const a of accounts.slice(0, 20)) {
    let token2: string | undefined;
    for (let i = 0; i < 5; i++) {
      const qs = new URLSearchParams({ readMask: 'name,title,websiteUri,phoneNumbers,metadata', pageSize: '100', ...(token2 ? { pageToken: token2 } : {}) });
      const j = z.object({ locations: z.array(loc).optional(), nextPageToken: z.string().optional() }).parse(await requestJson(`${INFO}/${a.name}/locations?${qs}`, opts(token, log)));
      for (const l of j.locations ?? []) {
        out.push({ account: a.name, accountName: a.accountName, location: l.name, title: l.title ?? l.name, website: l.websiteUri ?? null, phone: l.phoneNumbers?.primaryPhone ?? null, mapsUri: l.metadata?.mapsUri ?? null, placeId: l.metadata?.placeId ?? null });
      }
      token2 = j.nextPageToken;
      if (!token2) break;
    }
  }
  return out;
}

/** Locations whose website is the audited domain come first. */
export function matchGbpLocations(locs: GbpLocation[], domain: string): (GbpLocation & { matches: boolean })[] {
  const host = (u: string | null) => {
    try {
      return u ? new URL(u).hostname.replace(/^www\./, '').toLowerCase() : '';
    } catch {
      return '';
    }
  };
  return locs.map((l) => ({ ...l, matches: host(l.website) === domain })).sort((a, b) => Number(b.matches) - Number(a.matches) || a.title.localeCompare(b.title));
}

/** v4 path for a location: accounts/{a}/locations/{l} (Business Information names it locations/{l}). */
export const gbpPath = (account: string, location: string) => `${account}/${location.replace(/^.*locations\//, 'locations/')}`;

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
export type GbpReview = { name: string; reviewer: string; stars: number | null; comment: string; createTime: string; reply: { comment: string; updateTime: string | null } | null };

export async function listGbpReviews(token: string, path: string, log?: HttpLog): Promise<{ reviews: GbpReview[]; averageRating: number | null; total: number | null }> {
  const j = z
    .object({
      reviews: z
        .array(
          z.object({
            name: z.string(),
            reviewer: z.object({ displayName: z.string().optional() }).optional(),
            starRating: z.string().optional(),
            comment: z.string().optional(),
            createTime: z.string().optional(),
            reviewReply: z.object({ comment: z.string().optional(), updateTime: z.string().optional() }).optional(),
          }),
        )
        .optional(),
      averageRating: z.number().optional(),
      totalReviewCount: z.number().optional(),
    })
    .parse(await requestJson(`${V4}/${path}/reviews?pageSize=50&orderBy=${encodeURIComponent('updateTime desc')}`, opts(token, log)));
  return {
    averageRating: j.averageRating ?? null,
    total: j.totalReviewCount ?? null,
    reviews: (j.reviews ?? []).map((r) => ({
      name: r.name,
      reviewer: r.reviewer?.displayName ?? 'A customer',
      stars: STARS[r.starRating ?? ''] ?? null,
      comment: r.comment ?? '',
      createTime: r.createTime ?? '',
      reply: r.reviewReply?.comment ? { comment: r.reviewReply.comment, updateTime: r.reviewReply.updateTime ?? null } : null,
    })),
  };
}

/** Creates or replaces the owner's reply to a review. */
export async function replyGbpReview(token: string, reviewName: string, comment: string, log?: HttpLog): Promise<void> {
  await requestJson(`${V4}/${reviewName}/reply`, { ...opts(token, log), method: 'PUT', body: { comment }, retries: 0 });
}

export async function deleteGbpReply(token: string, reviewName: string, log?: HttpLog): Promise<void> {
  const res = await request(`${V4}/${reviewName}/reply`, { ...opts(token, log), method: 'DELETE', retries: 0 });
  if (!res.ok && res.status !== 404) throw new Error(`Google answered ${res.status}`);
}

export type GbpPost = { name: string; summary: string; createTime: string | null; state: string | null; url: string | null };

export async function listGbpPosts(token: string, path: string, log?: HttpLog): Promise<GbpPost[]> {
  const j = z
    .object({ localPosts: z.array(z.object({ name: z.string(), summary: z.string().optional(), createTime: z.string().optional(), state: z.string().optional(), searchUrl: z.string().optional() })).optional() })
    .parse(await requestJson(`${V4}/${path}/localPosts?pageSize=10`, opts(token, log)));
  return (j.localPosts ?? []).map((p) => ({ name: p.name, summary: p.summary ?? '', createTime: p.createTime ?? null, state: p.state ?? null, url: p.searchUrl ?? null }));
}

export type GbpCallToAction = 'CALL' | 'LEARN_MORE' | 'BOOK';
/** A "What's new" post (topicType STANDARD) with an optional button. */
export async function createGbpPost(token: string, path: string, p: { summary: string; action: GbpCallToAction | null; url: string | null; language: string }, log?: HttpLog): Promise<GbpPost> {
  const cta = p.action === 'CALL' ? { actionType: 'CALL' } : p.action && p.url ? { actionType: p.action, url: p.url } : undefined;
  const j = z
    .object({ name: z.string(), summary: z.string().optional(), createTime: z.string().optional(), state: z.string().optional(), searchUrl: z.string().optional() })
    .parse(await requestJson(`${V4}/${path}/localPosts`, { ...opts(token, log), method: 'POST', body: { languageCode: p.language, summary: p.summary, topicType: 'STANDARD', ...(cta ? { callToAction: cta } : {}) }, retries: 0 }));
  return { name: j.name, summary: j.summary ?? p.summary, createTime: j.createTime ?? null, state: j.state ?? null, url: j.searchUrl ?? null };
}
