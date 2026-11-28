import { parsePageContent } from '../audit/page-content';
import { ga4KeyEvents, ga4MeasurementIds, ga4Report, type Ga4Row } from '../providers/ga4';
import { gscSearchAnalytics } from '../providers/gsc';
import { request, type HttpLog } from '../providers/http';
import type { ReportModel } from '../types';
import { siteUrl, siteHost } from '../site-key';

/**
 * Module 11 · Tracking and conversion audit. 11.1 Search Console + GA4 connected, receiving data and
 * the GA4 tag on the site · 11.2 key events vs the ways to get in touch found on the site (calls,
 * forms, chat, WhatsApp, bookings) · 11.3 call tracking scripts · 11.4 source/medium hygiene
 * (Unassigned, (not set), self-referrals, payment gateways) · 11.5 leads per page · 11.6 landing
 * page friction (form fields, call button, mobile speed) · 11.7 lead quality (filled in by a person).
 */
export type Channel = 'call' | 'form' | 'chat' | 'whatsapp' | 'booking' | 'email';
export const CHANNEL_LABEL: Record<Channel, string> = { call: 'Phone calls', form: 'Forms', chat: 'Chat', whatsapp: 'WhatsApp', booking: 'Online booking', email: 'Email links' };
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';
export type TrackingCheck = { id: string; point: string; label: string; status: CheckStatus; detail: string; fix: string | null };

export type PageTags = {
  url: string;
  status: number;
  ga4: string[];
  gtm: string[];
  /** Tag managers other than Google Tag Manager (Adobe Launch, Tealium, Segment, Matomo). */
  tagManagers?: string[];
  googleAds: string[];
  metaPixel: boolean;
  otherAnalytics: string[];
  callTracking: string[];
  chat: string[];
  booking: string[];
  whatsapp: boolean;
  tel: number;
  mailto: number;
  forms: number[];
};

export type TrackingManual = { leadsMatched: boolean | null; crm: string; notes: string; updatedAt: string | null };
export type TrackingAudit = {
  domain: string;
  runAt: string;
  connections: { gsc: boolean; gscClicks28: number | null; ga4: boolean; ga4Sessions28: number | null; tagIds: string[]; streamIds: string[] };
  pages: PageTags[];
  channels: { channel: Channel; onSite: boolean; pages: number; keyEvents: string[]; count28: number | null }[];
  keyEvents: { eventName: string; channel: Channel | 'purchase' | null; count28: number }[];
  sources: { groups: { name: string; sessions: number; share: number }[]; unassigned: number; notSet: number; selfReferrals: { source: string; sessions: number }[]; gateways: { source: string; sessions: number }[] } | null;
  leadPages: { path: string; sessions: number; leads: number; rate: number }[];
  friction: { url: string; formFields: number | null; callLink: boolean; mobileScore: number | null; issues: string[] }[];
  checks: TrackingCheck[];
  notes: string[];
};
export type TrackingWorkspace = { domain: string; audit: TrackingAudit | null; manual: TrackingManual };
export const emptyTracking = (domain: string): TrackingWorkspace => ({ domain, audit: null, manual: { leadsMatched: null, crm: '', notes: '', updatedAt: null } });

const CALL_TRACKING: [RegExp, string][] = [
  [/callrail\.com/i, 'CallRail'],
  [/tctm\.co|calltrackingmetrics/i, 'CallTrackingMetrics'],
  [/whatconverts/i, 'WhatConverts'],
  [/invoca(cdn)?\.(net|com)/i, 'Invoca'],
  [/marchex|voicestar/i, 'Marchex'],
  [/responsetap/i, 'ResponseTap'],
  [/infinity-tracking|infinitycdn/i, 'Infinity'],
  [/ruleranalytics|rulerlabs/i, 'Ruler Analytics'],
  [/phone_conversion_number|_googWcm/i, 'Google Ads call tracking'],
];
const CHAT: [RegExp, string][] = [
  [/widget\.intercom\.io|intercomcdn/i, 'Intercom'],
  [/js\.driftt\.com|drift\.com\/include/i, 'Drift'],
  [/embed\.tawk\.to/i, 'Tawk.to'],
  [/livechatinc\.com/i, 'LiveChat'],
  [/js\.usemessages\.com/i, 'HubSpot chat'],
  [/static\.zdassets\.com/i, 'Zendesk'],
  [/client\.crisp\.chat/i, 'Crisp'],
  [/code\.tidio\.co/i, 'Tidio'],
  [/podium\.com/i, 'Podium'],
  [/birdeye\.com\/embed|birdeye\.com\/widget/i, 'Birdeye'],
  [/olark\.com/i, 'Olark'],
  [/freshchat\.com/i, 'Freshchat'],
  [/customerchat|xfbml\.customerchat/i, 'Messenger'],
];
const BOOKING: [RegExp, string][] = [
  [/calendly\.com/i, 'Calendly'],
  [/servicetitan\.com/i, 'ServiceTitan'],
  [/housecallpro\.com/i, 'Housecall Pro'],
  [/getjobber\.com/i, 'Jobber'],
  [/acuityscheduling\.com/i, 'Acuity'],
  [/squareup\.com\/appointments|square\.site\/book/i, 'Square Appointments'],
  [/setmore\.com/i, 'Setmore'],
  [/simplybook\.(me|it)/i, 'SimplyBook'],
  [/booksy\.com/i, 'Booksy'],
  [/zocdoc\.com/i, 'Zocdoc'],
  [/opentable\.com/i, 'OpenTable'],
];
const OTHER_ANALYTICS: [RegExp, string][] = [
  [/clarity\.ms/i, 'Microsoft Clarity'],
  [/hotjar\.com/i, 'Hotjar'],
  [/\bUA-\d{4,10}-\d{1,3}\b/, 'Universal Analytics (switched off by Google)'],
  [/bat\.bing\.com/i, 'Microsoft Ads'],
];
const TAG_MANAGERS: [RegExp, string][] = [
  [/assets\.adobedtm\.com/i, 'Adobe Launch'],
  [/tags\.tiqcdn\.com/i, 'Tealium'],
  [/cdn\.segment\.(com|io)/i, 'Segment'],
  [/matomo\.js|piwik\.js|cdn\.matomo\.cloud/i, 'Matomo'],
];
const found = (html: string, list: [RegExp, string][]) => [...new Set(list.filter(([r]) => r.test(html)).map(([, n]) => n))];
const ids = (html: string, re: RegExp) => [...new Set((html.match(re) ?? []).map((x) => x.toUpperCase()))];

/** 11.1–11.3 What the page's HTML loads: tags, call tracking, chat, booking, ways to get in touch. */
export function detectTags(html: string, url: string, status = 200): PageTags {
  const page = parsePageContent(html, url, status);
  return {
    url,
    status,
    ga4: ids(html, /\bG-[A-Z0-9]{6,12}\b/g),
    gtm: ids(html, /\bGTM-[A-Z0-9]{4,9}\b/g),
    tagManagers: found(html, TAG_MANAGERS),
    googleAds: ids(html, /\bAW-\d{6,12}\b/g),
    metaPixel: /fbevents\.js|fbq\(\s*['"]init/i.test(html),
    otherAnalytics: found(html, OTHER_ANALYTICS),
    callTracking: found(html, CALL_TRACKING),
    chat: found(html, CHAT),
    booking: found(html, BOOKING),
    whatsapp: /wa\.me\/|api\.whatsapp\.com\/send|web\.whatsapp\.com\/send/i.test(html),
    tel: page.telLinks,
    mailto: (html.match(/href\s*=\s*["']mailto:/gi) ?? []).length,
    // One-field forms are site search or newsletter boxes, not ways to get in touch.
    forms: page.forms.filter((f) => f.fields >= 2).map((f) => f.fields),
  };
}

/** 11.2 Which way of getting in touch a GA4 event name stands for. */
export function eventChannel(name: string): Channel | 'purchase' | null {
  const n = name.toLowerCase();
  if (/whats_?app/.test(n)) return 'whatsapp';
  if (/chat|messag/.test(n)) return 'chat';
  if (/call|phone|\btel\b|tel_/.test(n)) return 'call';
  if (/book|appointment|schedul|reserv/.test(n)) return 'booking';
  if (/form|submit|lead|contact|quote|estimate|sign_?up|enquir|inquir/.test(n)) return 'form';
  if (/purchase|checkout|payment/.test(n)) return 'purchase';
  if (/email|mailto/.test(n)) return 'email';
  return null;
}

const GATEWAYS = /paypal|stripe|klarna|afterpay|clearpay|sezzle|affirm|checkout\.shopify|squareup|worldpay|sagepay|opayo|braintree/i;

/** 11.4 Channel groups, (not set) / Unassigned share, self-referrals and payment gateways. */
export function sourceHygiene(groups: Ga4Row[], sources: Ga4Row[], domain: string): NonNullable<TrackingAudit['sources']> {
  const total = groups.reduce((s, r) => s + (r.mets[0] ?? 0), 0) || 1;
  const share = (n: number) => Math.round((n / total) * 1000) / 10;
  const g = groups.map((r) => ({ name: r.dims[0] || '(not set)', sessions: r.mets[0] ?? 0 })).sort((a, b) => b.sessions - a.sessions);
  const sum = (test: (s: string) => boolean) => sources.filter((r) => test(r.dims[0] ?? '')).reduce((s, r) => s + (r.mets[0] ?? 0), 0);
  const root = domain.replace(/^www\./, '').split('.')[0] ?? domain;
  const host = siteHost(domain);
  const isSelf = (s: string) => s.includes('referral') && (s.includes(host) || s.split(' / ')[0]!.endsWith(`.${host}`) || s.split(' / ')[0] === host);
  return {
    groups: g.map((x) => ({ ...x, share: share(x.sessions) })),
    unassigned: share(g.filter((x) => /unassigned/i.test(x.name)).reduce((s, x) => s + x.sessions, 0)),
    notSet: share(sum((s) => s.includes('(not set)'))),
    selfReferrals: sources.filter((r) => isSelf(r.dims[0] ?? '') && root.length > 2).map((r) => ({ source: r.dims[0]!, sessions: r.mets[0] ?? 0 })).slice(0, 10),
    gateways: sources.filter((r) => /referral/.test(r.dims[0] ?? '') && GATEWAYS.test(r.dims[0] ?? '')).map((r) => ({ source: r.dims[0]!, sessions: r.mets[0] ?? 0 })).slice(0, 10),
  };
}

export type TrackingDeps = {
  /** Raw HTML of a page (default: a plain fetch with a browser user agent). */
  fetchHtml?: (url: string) => Promise<{ url: string; status: number; html: string } | null>;
  ga4?: {
    keyEvents: (token: string, property: string) => Promise<{ eventName: string; custom: boolean }[]>;
    measurementIds: (token: string, property: string) => Promise<string[]>;
    report: (token: string, property: string, o: { days: number; dimensions: string[]; metrics: string[]; limit?: number }) => Promise<Ga4Row[]>;
  };
  gscClicks?: (token: string, property: string) => Promise<number>;
  log?: HttpLog;
};
export type TrackingInput = {
  domain: string;
  report: ReportModel | null;
  gsc: { token: string; property: string } | null;
  ga4: { token: string; property: string } | null;
};

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
export async function fetchHtml(url: string, log?: HttpLog): Promise<{ url: string; status: number; html: string; xRobots: string | null } | null> {
  try {
    const res = await request(url, { provider: 'site', headers: { 'user-agent': BROWSER_UA, accept: 'text/html' }, timeoutMs: 20_000, retries: 1, log });
    const html = /html/i.test(res.headers.get('content-type') ?? '') ? (await res.text()).slice(0, 1_500_000) : '';
    if (!html) await res.body?.cancel().catch(() => undefined);
    return { url: res.url || url, status: res.status, html, xRobots: res.headers.get('x-robots-tag') };
  } catch {
    return null;
  }
}

const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
const pathOf = (u: string) => {
  try {
    return new URL(u).pathname.replace(/\/$/, '') || '/';
  } catch {
    return u;
  }
};

/** Pages to check: the homepage, a contact page and up to four service or place pages. */
export function trackingPages(domain: string, report: ReportModel | null, homeHtml: string | null): string[] {
  const home = siteUrl(domain);
  const pages = report?.pages ?? [];
  const contact = pages.find((p) => p.pageType === 'contact')?.url ?? (homeHtml?.match(/href=["']([^"']*\/contact[^"'#?]*)["']/i)?.[1] ?? null);
  const key = pages.filter((p) => /^(service|location|service_location)$/.test(p.pageType ?? '')).map((p) => p.url);
  const abs = (u: string) => {
    try {
      return new URL(u, home).toString();
    } catch {
      return null;
    }
  };
  return [...new Set([home, ...(contact ? [abs(contact)] : []), ...key.slice(0, 4)].filter((u): u is string => Boolean(u)))];
}

export async function runTrackingAudit(input: TrackingInput, deps: TrackingDeps = {}, now = new Date()): Promise<TrackingAudit> {
  const get = deps.fetchHtml ?? ((u: string) => fetchHtml(u, deps.log));
  const api = deps.ga4 ?? { keyEvents: (t: string, p: string) => ga4KeyEvents(t, p, deps.log), measurementIds: (t: string, p: string) => ga4MeasurementIds(t, p, deps.log), report: (t: string, p: string, o: { days: number; dimensions: string[]; metrics: string[]; limit?: number }) => ga4Report(t, p, o, deps.log) };
  const gscClicks =
    deps.gscClicks ??
    (async (t: string, p: string) => (await gscSearchAnalytics(t, p, { startDate: day(31), endDate: day(3), dimensions: ['date'], maxRows: 100 }, deps.log)).reduce((s, r) => s + r.clicks, 0));
  const notes: string[] = [];
  const domain = input.domain;

  const homeRes = await get(siteUrl(domain));
  const urls = trackingPages(domain, input.report, homeRes?.html ?? null);
  const rest = await Promise.all(urls.slice(1).map((u) => get(u)));
  const fetched = [homeRes, ...rest].filter((r): r is { url: string; status: number; html: string } => Boolean(r?.html));
  if (!homeRes?.html) notes.push('The homepage could not be loaded, so the tags on the site were not checked.');
  const pages = fetched.map((r) => detectTags(r.html, r.url, r.status));
  const tagIds = [...new Set(pages.flatMap((p) => p.ga4))];

  const g = input.ga4;
  const safe = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      notes.push(`${label} could not be read: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}`);
      return fallback;
    }
  };
  const [gscClicks28, keyEventList, streamIds, totals, events, groups, sources, landing] = await Promise.all([
    input.gsc ? safe('Search Console', () => gscClicks(input.gsc!.token, input.gsc!.property), null as number | null) : Promise.resolve(null),
    g ? safe('GA4 key events', () => api.keyEvents(g.token, g.property), []) : Promise.resolve([]),
    g ? safe('GA4 data streams', () => api.measurementIds(g.token, g.property), []) : Promise.resolve([]),
    g ? safe('GA4 sessions', () => api.report(g.token, g.property, { days: 28, dimensions: [], metrics: ['sessions'] }), []) : Promise.resolve([]),
    g ? safe('GA4 events', () => api.report(g.token, g.property, { days: 28, dimensions: ['eventName'], metrics: ['eventCount', 'keyEvents'], limit: 200 }), []) : Promise.resolve([]),
    g ? safe('GA4 channels', () => api.report(g.token, g.property, { days: 28, dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions'], limit: 50 }), []) : Promise.resolve([]),
    g ? safe('GA4 sources', () => api.report(g.token, g.property, { days: 28, dimensions: ['sessionSourceMedium'], metrics: ['sessions'], limit: 300 }), []) : Promise.resolve([]),
    g ? safe('GA4 landing pages', () => api.report(g.token, g.property, { days: 90, dimensions: ['landingPage'], metrics: ['sessions', 'keyEvents'], limit: 500 }), []) : Promise.resolve([]),
  ]);
  const ga4Sessions28 = g ? Math.round(totals[0]?.mets[0] ?? 0) : null;

  // 11.2 key events by way of getting in touch.
  const counts = new Map(events.map((r) => [r.dims[0] ?? '', r.mets[1] || r.mets[0] || 0]));
  const keyEvents = keyEventList.map((k) => ({ eventName: k.eventName, channel: eventChannel(k.eventName), count28: Math.round(counts.get(k.eventName) ?? 0) }));
  const onSite: Record<Channel, number> = {
    call: pages.filter((p) => p.tel > 0).length,
    form: pages.filter((p) => p.forms.length > 0).length,
    chat: pages.filter((p) => p.chat.length > 0).length,
    whatsapp: pages.filter((p) => p.whatsapp).length,
    booking: pages.filter((p) => p.booking.length > 0).length,
    email: pages.filter((p) => p.mailto > 0).length,
  };
  const channels = (Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => {
    const ke = keyEvents.filter((k) => k.channel === c);
    return { channel: c, onSite: onSite[c] > 0, pages: onSite[c], keyEvents: ke.map((k) => k.eventName), count28: g ? ke.reduce((s, k) => s + k.count28, 0) : null };
  });
  const callTracking = [...new Set(pages.flatMap((p) => p.callTracking))];

  // 11.5 leads per landing page.
  const leadPages = landing
    .map((r) => ({ path: r.dims[0] || '(not set)', sessions: Math.round(r.mets[0] ?? 0), leads: Math.round(r.mets[1] ?? 0) }))
    .filter((r) => r.sessions >= 10)
    .map((r) => ({ ...r, rate: Math.round((r.leads / r.sessions) * 1000) / 10 }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 25);

  // 11.6 friction on the pages people land on.
  const speed = new Map((input.report?.speedByTemplate ?? []).map((s) => [pathOf(s.url), s.mobile]));
  const friction = pages.map((p) => {
    const fields = p.forms.length ? Math.min(...p.forms) : null;
    const mobileScore = speed.get(pathOf(p.url)) ?? null;
    const issues: string[] = [];
    if (fields !== null && fields > 5) issues.push(`The shortest form has ${fields} fields (aim for 5 or fewer)`);
    if (!p.tel && !p.booking.length) issues.push('No call link (tel:) or booking button');
    if (mobileScore !== null && mobileScore < 50) issues.push(`Slow on mobile (${mobileScore}/100)`);
    if (!p.forms.length && !p.chat.length && !p.whatsapp && !p.booking.length) issues.push('No form, chat or booking: calls are the only way in');
    return { url: p.url, formFields: fields, callLink: p.tel > 0, mobileScore, issues };
  });

  const hygiene = g && groups.length ? sourceHygiene(groups, sources, domain) : null;
  const checks = trackingChecks({ input, pages, tagIds, streamIds, gscClicks28, ga4Sessions28, channels, keyEvents, callTracking, hygiene, leadPages, friction });
  return {
    domain,
    runAt: now.toISOString(),
    connections: { gsc: Boolean(input.gsc), gscClicks28, ga4: Boolean(g), ga4Sessions28, tagIds, streamIds },
    pages,
    channels,
    keyEvents,
    sources: hygiene,
    leadPages,
    friction,
    checks,
    notes,
  };
}

/** The checks shown at the top of the page, one per checklist point. */
export function trackingChecks(x: {
  input: TrackingInput;
  pages: PageTags[];
  tagIds: string[];
  streamIds: string[];
  gscClicks28: number | null;
  ga4Sessions28: number | null;
  channels: TrackingAudit['channels'];
  keyEvents: TrackingAudit['keyEvents'];
  callTracking: string[];
  hygiene: TrackingAudit['sources'];
  leadPages: TrackingAudit['leadPages'];
  friction: TrackingAudit['friction'];
}): TrackingCheck[] {
  const out: TrackingCheck[] = [];
  const add = (c: TrackingCheck) => out.push(c);
  const gtm = [...new Set(x.pages.flatMap((p) => p.gtm))];
  // 11.1
  add(
    !x.input.gsc
      ? { id: 'gsc', point: '11.1', label: 'Search Console connected', status: 'fail', detail: 'No Search Console property is connected for this site.', fix: 'Connect Google (Connections) and choose the Search Console property.' }
      : x.gscClicks28 === null
        ? { id: 'gsc', point: '11.1', label: 'Search Console connected', status: 'warn', detail: 'Connected, but the data could not be read.', fix: 'Check that the account still has access to the property.' }
        : { id: 'gsc', point: '11.1', label: 'Search Console connected', status: 'pass', detail: `Connected · ${x.gscClicks28.toLocaleString('en-US')} clicks in the last 28 days.`, fix: null },
  );
  add(
    !x.input.ga4
      ? { id: 'ga4', point: '11.1', label: 'Google Analytics 4 connected', status: 'fail', detail: 'No GA4 property is connected for this site.', fix: 'Connect Google (Connections) and choose the GA4 property.' }
      : !x.ga4Sessions28
        ? { id: 'ga4', point: '11.1', label: 'Google Analytics 4 connected', status: 'fail', detail: 'Connected, but GA4 recorded no visits in the last 28 days.', fix: 'Check the GA4 tag is on every page and points at this property.' }
        : { id: 'ga4', point: '11.1', label: 'Google Analytics 4 connected', status: 'pass', detail: `Connected · ${x.ga4Sessions28.toLocaleString('en-US')} visits in the last 28 days.`, fix: null },
  );
  // Other tag managers (Adobe Launch, Tealium, Segment…) can load GA4 without its id in the HTML.
  const loaders = [...new Set(x.pages.flatMap((p) => p.tagManagers ?? []))];
  const tagged = x.pages.filter((p) => p.ga4.length || p.gtm.length || p.tagManagers?.length).length;
  const matches = x.streamIds.length ? x.tagIds.some((t) => x.streamIds.includes(t)) : null;
  const receiving = Boolean(x.input.ga4 && x.ga4Sessions28);
  add(
    !x.pages.length
      ? { id: 'tag', point: '11.1', label: 'Analytics tag on the site', status: 'info', detail: 'The site could not be loaded.', fix: null }
      : !x.tagIds.length && !gtm.length && receiving
        ? { id: 'tag', point: '11.1', label: 'Analytics tag on the site', status: 'pass', detail: `GA4 receives visits${loaders.length ? `; the tag loads through ${loaders.join(', ')}` : ''}.`, fix: null }
        : !x.tagIds.length && !gtm.length && loaders.length
          ? { id: 'tag', point: '11.1', label: 'Analytics tag on the site', status: 'warn', detail: `No GA4 tag in the page’s HTML, but ${loaders.join(', ')} loads other tags and may include GA4.`, fix: 'Connect GA4 to confirm visits arrive, or check with Google Tag Assistant.' }
      : tagged < x.pages.length
        ? { id: 'tag', point: '11.1', label: 'Analytics tag on the site', status: tagged ? 'warn' : 'fail', detail: `A GA4 tag or tag manager was found on ${tagged} of ${x.pages.length} checked pages.`, fix: 'Add the GA4 tag (or Tag Manager) to every page, usually in the site-wide header.' }
        : matches === false && !gtm.length
          ? { id: 'tag', point: '11.1', label: 'Analytics tag on the site', status: 'fail', detail: `The site sends data to ${x.tagIds.join(', ')}, but the connected GA4 property uses ${x.streamIds.join(', ')}.`, fix: 'Use the measurement id of the connected property, or connect the property the site uses.' }
          : { id: 'tag', point: '11.1', label: 'Analytics tag on the site', status: 'pass', detail: [x.tagIds.length && `GA4 ${x.tagIds.join(', ')}`, gtm.length && `Tag Manager ${gtm.join(', ')}`].filter(Boolean).join(' · ') + ` on all ${x.pages.length} checked pages.`, fix: null },
  );
  // 11.2
  const missing = x.channels.filter((c) => c.onSite && c.channel !== 'email' && !c.keyEvents.length);
  add(
    !x.input.ga4
      ? { id: 'events', point: '11.2', label: 'Leads counted as key events', status: 'info', detail: `Ways to get in touch on the site: ${x.channels.filter((c) => c.onSite).map((c) => CHANNEL_LABEL[c.channel].toLowerCase()).join(', ') || 'none found'}. Connect GA4 to check they are counted.`, fix: null }
      : !x.keyEvents.length
        ? { id: 'events', point: '11.2', label: 'Leads counted as key events', status: 'fail', detail: 'GA4 has no key events, so no lead is counted.', fix: 'Mark the lead events (call clicks, form sends, bookings) as key events in GA4 → Admin → Events.' }
        : missing.length
          ? { id: 'events', point: '11.2', label: 'Leads counted as key events', status: 'warn', detail: `Not counted as key events: ${missing.map((c) => CHANNEL_LABEL[c.channel].toLowerCase()).join(', ')}. Counted: ${x.keyEvents.map((k) => k.eventName).join(', ')}.`, fix: 'Add an event for each way to get in touch and mark it as a key event.' }
          : { id: 'events', point: '11.2', label: 'Leads counted as key events', status: 'pass', detail: `Key events: ${x.keyEvents.map((k) => `${k.eventName} (${k.count28})`).join(', ')} in the last 28 days.`, fix: null },
  );
  const silent = x.keyEvents.filter((k) => k.count28 === 0 && k.channel && k.channel !== 'purchase');
  if (x.input.ga4 && silent.length) add({ id: 'events-zero', point: '11.2', label: 'Key events that never fire', status: 'warn', detail: `No events in 28 days: ${silent.map((k) => k.eventName).join(', ')}.`, fix: 'Test each one (GA4 DebugView): the trigger may be broken.' });
  // 11.3
  const calls = x.channels.find((c) => c.channel === 'call');
  add(
    x.callTracking.length
      ? { id: 'calltracking', point: '11.3', label: 'Call tracking', status: 'pass', detail: `Found: ${x.callTracking.join(', ')}.`, fix: null }
      : calls?.onSite
        ? { id: 'calltracking', point: '11.3', label: 'Call tracking', status: 'warn', detail: 'No call tracking script found. Calls from search cannot be told apart from other calls.', fix: 'Add call tracking with dynamic number insertion (e.g. CallRail) or at least a GA4 event on phone-number clicks.' }
        : { id: 'calltracking', point: '11.3', label: 'Call tracking', status: 'info', detail: 'No phone link on the checked pages.', fix: null },
  );
  // 11.4
  if (x.hygiene) {
    const h = x.hygiene;
    const bad = h.unassigned + h.notSet;
    add({
      id: 'sources',
      point: '11.4',
      label: 'Traffic sources are clean',
      status: bad > 15 || h.selfReferrals.length || h.gateways.length ? (bad > 30 ? 'fail' : 'warn') : 'pass',
      detail: [`Unassigned ${h.unassigned}%`, `(not set) ${h.notSet}%`, h.selfReferrals.length && `self-referrals from ${h.selfReferrals.map((s) => s.source.split(' / ')[0]).join(', ')}`, h.gateways.length && `payment sites as referrers: ${h.gateways.map((s) => s.source.split(' / ')[0]).join(', ')}`].filter(Boolean).join(' · '),
      fix: bad > 15 || h.selfReferrals.length || h.gateways.length ? 'Tag campaign links with utm_source/utm_medium, add your own domain and payment sites to the unwanted referrals list (GA4 → Data streams → Configure tag settings).' : null,
    });
  }
  // 11.5
  if (x.leadPages.length) {
    const none = x.leadPages.filter((p) => p.leads === 0 && p.sessions >= 50);
    add({
      id: 'leadpages',
      point: '11.5',
      label: 'Pages that bring leads',
      status: none.length ? 'warn' : 'pass',
      detail: none.length ? `${none.length} pages with 50+ visits and no lead in 90 days: ${none.slice(0, 4).map((p) => p.path).join(', ')}.` : `Every busy landing page brings leads.`,
      fix: none.length ? 'Add a clear call to action and a short form or call button near the top of these pages.' : null,
    });
  }
  // 11.6
  const rough = x.friction.filter((f) => f.issues.length);
  add({
    id: 'friction',
    point: '11.6',
    label: 'Easy to get in touch',
    status: !x.friction.length ? 'info' : rough.length ? 'warn' : 'pass',
    detail: !x.friction.length ? 'No pages could be checked.' : rough.length ? `${rough.length} of ${x.friction.length} checked pages make it harder to get in touch.` : `All ${x.friction.length} checked pages have a call button or booking, short forms and no slow mobile score.`,
    fix: rough.length ? 'See the page list below.' : null,
  });
  return out;
}
