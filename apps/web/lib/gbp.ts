import 'server-only';
import {
  createGbpPost, createOpenAiClient, draftPost, draftReviewReply, gbpPath, listGbpLocations, listGbpPosts, listGbpReviews, matchGbpLocations, normDomain, refreshGscToken, replyGbpReview, resolveProfileLink,
  type GbpCallToAction, type GbpLocation, type GbpPost, type GbpReview, type ProfileFacts,
} from '@seo/core';
import { decryptSecret, encryptionKeyValid, encryptSecret } from '@seo/core/server';
import { accountSites, domainOf, listAccounts } from './accounts';
import { getKeywordWorkspace, logUsage } from './keywords';
import { getLocal } from './local';
import { providerConfig } from './providers-config';
import { getDoc, saveDoc } from './site-docs';

/**
 * Google Business Profile per website (`SiteDocument` kind "gbp"):
 *  - the profile entered by hand (Maps link, place ID or CID), used by the Local audit and monitoring;
 *  - the optional connection (OAuth, business.manage) to read reviews, reply to them and publish posts.
 *    Google must approve the Cloud project for the Business Profile APIs before any call works.
 */
const KIND = 'gbp';
export type GbpLogEntry = { at: string; kind: 'reply' | 'post'; text: string; by: 'team' | 'customer'; target: string | null };
export type GbpSettings = {
  domain: string;
  link: string | null;
  ref: string | null;
  connection: { email: string; tokenEnc: string; scopes: string; connectedAt: string; account: string | null; location: string | null; title: string | null } | null;
  log: GbpLogEntry[];
  updatedAt: string | null;
};
const empty = (domain: string): GbpSettings => ({ domain, link: null, ref: null, connection: null, log: [], updatedAt: null });

export async function getGbp(rawDomain: string): Promise<GbpSettings> {
  const domain = normDomain(rawDomain);
  return { ...empty(domain), ...((await getDoc<GbpSettings>(KIND, domain)) ?? {}) };
}
const save = (s: GbpSettings) => saveDoc(KIND, s.domain, { ...s, updatedAt: new Date().toISOString() });

/** Saves the profile link (or clears it with an empty value). Returns false when it is not a profile link. */
export async function saveProfileLink(rawDomain: string, raw: string): Promise<'saved' | 'cleared' | 'invalid'> {
  const s = await getGbp(rawDomain);
  if (!raw.trim()) {
    await save({ ...s, link: null, ref: null });
    return 'cleared';
  }
  const ref = await resolveProfileLink(raw);
  if (!ref) return 'invalid';
  await save({ ...s, link: raw.trim().slice(0, 500), ref });
  return 'saved';
}

export const gbpConnectReady = () => Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() && encryptionKeyValid());

export async function saveGbpConnection(rawDomain: string, c: { email: string; refreshToken: string; scopes: string }): Promise<void> {
  const s = await getGbp(rawDomain);
  await save({ ...s, connection: { email: c.email, tokenEnc: encryptSecret(c.refreshToken), scopes: c.scopes, connectedAt: new Date().toISOString(), account: null, location: null, title: null } });
}

export async function disconnectGbp(rawDomain: string): Promise<void> {
  const s = await getGbp(rawDomain);
  await save({ ...s, connection: null });
}

async function token(s: GbpSettings): Promise<string> {
  if (!s.connection) throw new Error('The Business Profile is not connected.');
  return refreshGscToken({ clientId: process.env.GOOGLE_CLIENT_ID!.trim(), clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim() }, decryptSecret(s.connection.tokenEnc));
}

/** Plain-English message for Google's errors (quota 0 = the project is not approved yet). */
export function gbpError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(m)) return 'Google has not switched on Business Profile access for this app yet (quota 0). The team has applied; it works as soon as Google approves.';
  if (/403|PERMISSION_DENIED/i.test(m)) return 'This Google account cannot manage that Business Profile. Sign in with an owner or manager of the profile.';
  if (/401|invalid_grant/i.test(m)) return 'The Google sign-in has expired. Connect the Business Profile again.';
  return `Google answered: ${m.slice(0, 160)}`;
}

export async function gbpLocations(rawDomain: string): Promise<(GbpLocation & { matches: boolean })[]> {
  const s = await getGbp(rawDomain);
  return matchGbpLocations(await listGbpLocations(await token(s)), s.domain);
}

export async function chooseGbpLocation(rawDomain: string, loc: Pick<GbpLocation, 'account' | 'location' | 'title' | 'placeId'>): Promise<void> {
  const s = await getGbp(rawDomain);
  if (!s.connection) throw new Error('Not connected');
  // The chosen location also fills in the profile link, so the Local audit reads the same profile.
  await save({ ...s, connection: { ...s.connection, account: loc.account, location: loc.location, title: loc.title }, ...(loc.placeId && !s.ref ? { ref: `place_id:${loc.placeId}`, link: `place_id:${loc.placeId}` } : {}) });
}

export type GbpLive = { reviews: GbpReview[]; averageRating: number | null; total: number | null; posts: GbpPost[] };

export async function gbpLive(rawDomain: string): Promise<{ data?: GbpLive; error?: string }> {
  const s = await getGbp(rawDomain);
  if (!s.connection?.account || !s.connection.location) return {};
  try {
    const t = await token(s);
    const path = gbpPath(s.connection.account, s.connection.location);
    const [r, posts] = await Promise.all([listGbpReviews(t, path), listGbpPosts(t, path).catch(() => [])]);
    return { data: { ...r, posts } };
  } catch (err) {
    return { error: gbpError(err) };
  }
}

async function facts(domain: string): Promise<ProfileFacts> {
  const [local, kw, accounts] = await Promise.all([getLocal(domain), getKeywordWorkspace(domain), listAccounts()]);
  const account = accounts.find((a) => accountSites(a).some((w) => domainOf(w) === domain));
  return {
    name: local?.profile?.title ?? account?.businessName ?? domain,
    phone: local?.profile?.phone ?? account?.phone ?? null,
    places: kw.seeds.locations.slice(0, 5),
    services: kw.seeds.services.slice(0, 8),
    website: `https://${domain}/`,
  };
}

const ai = () => {
  const o = providerConfig().env?.openai;
  return o ? createOpenAiClient(o) : null;
};

export async function draftReply(rawDomain: string, review: { stars: number | null; comment: string; reviewer: string }): Promise<string> {
  const domain = normDomain(rawDomain);
  const r = await draftReviewReply(ai(), review, await facts(domain));
  if (r.tokens) await logUsage('openai', r.tokens);
  return r.text;
}

export async function draftGbpPost(rawDomain: string, topic: string): Promise<string> {
  const domain = normDomain(rawDomain);
  const r = await draftPost(ai(), await facts(domain), topic);
  if (r.tokens) await logUsage('openai', r.tokens);
  return r.text;
}

/** Posts a reply (a person pressed "Post reply"); logged on the settings. */
export async function postReply(rawDomain: string, reviewName: string, text: string, by: 'team' | 'customer'): Promise<void> {
  const s = await getGbp(rawDomain);
  const path = s.connection?.account && s.connection.location ? gbpPath(s.connection.account, s.connection.location) : null;
  if (!path || !reviewName.startsWith(`${path}/reviews/`)) throw new Error('This review does not belong to the connected profile.');
  await replyGbpReview(await token(s), reviewName, text);
  await save({ ...s, log: [{ at: new Date().toISOString(), kind: 'reply' as const, text: text.slice(0, 300), by, target: reviewName }, ...s.log].slice(0, 100) });
}

export async function publishPost(rawDomain: string, p: { summary: string; action: GbpCallToAction | null; url: string | null }, by: 'team' | 'customer'): Promise<GbpPost> {
  const s = await getGbp(rawDomain);
  if (!s.connection?.account || !s.connection.location) throw new Error('Choose the Business Profile first.');
  const kw = await getKeywordWorkspace(s.domain);
  const post = await createGbpPost(await token(s), gbpPath(s.connection.account, s.connection.location), { ...p, language: kw.language || 'en' });
  await save({ ...s, log: [{ at: new Date().toISOString(), kind: 'post' as const, text: p.summary.slice(0, 300), by, target: post.url }, ...s.log].slice(0, 100) });
  return post;
}

/** Everything the "Your Business Profile" panel shows (no token leaves the server). */
export async function profilePanelData(rawDomain: string, error: string | null): Promise<import('@/components/local/ProfilePanel').ProfilePanelData> {
  const s = await getGbp(rawDomain);
  const c = s.connection;
  let locations: (GbpLocation & { matches: boolean })[] | null = null;
  let live: GbpLive | null = null;
  let problem = error;
  if (c && !c.location) {
    try {
      locations = await gbpLocations(s.domain);
    } catch (err) {
      problem = gbpError(err);
    }
  } else if (c?.location) {
    const r = await gbpLive(s.domain);
    live = r.data ?? null;
    problem = problem ?? r.error ?? null;
  }
  return {
    domain: s.domain,
    link: s.link,
    ref: s.ref,
    connectReady: gbpConnectReady(),
    connection: c ? { email: c.email, title: c.title, chosen: Boolean(c.location) } : null,
    locations,
    live,
    error: problem,
  };
}
