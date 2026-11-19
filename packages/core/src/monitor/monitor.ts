import type { KeywordWorkspace } from '../keywords/types';
import { diffReports } from '../report/diff';
import type { ReportModel } from '../types';

/**
 * Module 13 · Reporting and monitoring. 13.1 baseline snapshot · 13.2 weekly summary · 13.3 monthly
 * report · 13.4 alerts (site down, noindex on key pages, robots.txt changes, traffic drops, new or
 * lower reviews, big ranking drops) · 13.5 weekly rank tracking of a keyword set from Module 4 ·
 * 13.6 AI share of voice from Module 10 in every snapshot · 13.7 dashboard · 13.8 review meetings.
 * Pure logic: fetching, Google and DataForSEO calls are passed in.
 */
export type AlertKind = 'down' | 'up' | 'noindex' | 'robots' | 'traffic' | 'reviews' | 'rank' | 'ssl' | 'errors';
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'info';
export type MonitorAlert = { id: string; kind: AlertKind; severity: AlertSeverity; title: string; detail: string; url: string | null; at: string; resolvedAt: string | null };
export type Snapshot = {
  date: string;
  score: number | null;
  clicks28: number | null;
  impressions28: number | null;
  position28: number | null;
  sessions28: number | null;
  leads28: number | null;
  tracked: number;
  top3: number;
  top10: number;
  aiShare: number | null;
  reviews: number | null;
  rating: number | null;
};
export type RankPoint = { date: string; positions: Record<string, number | null> };
export type MeetingCadence = 'none' | 'weekly' | 'fortnightly' | 'monthly';
export type MonitorWorkspace = {
  domain: string;
  /** Customer sites are always on; team sites once someone turns monitoring on. */
  enabled: boolean;
  createdAt: string;
  baseline: Snapshot | null;
  snapshots: Snapshot[];
  alerts: MonitorAlert[];
  state: { robotsHash: string | null; robotsBody: string | null; down: boolean; downSince: string | null; noindex: string[]; lastDaily: string | null; lastWeekly: string | null; lastMonthly: string | null; sslExpires?: string | null; lastAuditId?: string | null };
  ranks: { keywords: string[]; custom: boolean; history: RankPoint[] };
  meeting: { cadence: MeetingCadence; next: string | null; notes: string };
};
export const MONITOR_LIMITS = { keywords: 20, snapshots: 104, alerts: 200, history: 104 } as const;
/** One Google check per tracked keyword ($0.002) + one Business Profile read. */
export const WEEKLY_MONITOR_ESTIMATE_USD = 0.06;

export const emptyMonitor = (domain: string, now = new Date()): MonitorWorkspace => ({
  domain,
  enabled: false,
  createdAt: now.toISOString(),
  baseline: null,
  snapshots: [],
  alerts: [],
  state: { robotsHash: null, robotsBody: null, down: false, downSince: null, noindex: [], lastDaily: null, lastWeekly: null, lastMonthly: null },
  ranks: { keywords: [], custom: false, history: [] },
  meeting: { cadence: 'none', next: null, notes: '' },
});

/** FNV-1a: enough to notice that robots.txt changed (no crypto, so this file runs anywhere). */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 13.5 The keyword set: each top topic's head keyword by priority, then quick wins, then the most searched. */
export function pickTrackedKeywords(kw: KeywordWorkspace, max: number = MONITOR_LIMITS.keywords): string[] {
  const kept = kw.keywords.filter((k) => k.status === 'kept');
  const heads = [...kw.clusters].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).map((c) => c.head);
  const quick = kept.filter((k) => k.position !== null && k.position >= 4 && k.position <= 20).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).map((k) => k.term);
  const big = [...kept].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).map((k) => k.term);
  return [...new Set([...heads, ...quick, ...big].map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, max);
}

const disallowsAll = (robots: string | null) => {
  if (!robots) return false;
  let star = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const [k, ...v] = line.split(':');
    const key = (k ?? '').trim().toLowerCase();
    const val = v.join(':').trim();
    if (key === 'user-agent') star = val === '*';
    else if (star && key === 'disallow' && val === '/') return true;
  }
  return false;
};
const lines = (s: string | null) => new Set((s ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));

let seq = 0;
const alertId = (now: Date) => `${now.getTime().toString(36)}-${(seq++ % 1296).toString(36)}`;

/** Adds an alert unless the same kind for the same page is still open. Returns it when added. */
export function raise(ws: MonitorWorkspace, a: Omit<MonitorAlert, 'id' | 'at' | 'resolvedAt'>, now = new Date()): MonitorAlert | null {
  if (ws.alerts.some((x) => !x.resolvedAt && x.kind === a.kind && x.url === a.url && x.title === a.title)) return null;
  const alert: MonitorAlert = { ...a, id: alertId(now), at: now.toISOString(), resolvedAt: null };
  ws.alerts = [alert, ...ws.alerts].slice(0, MONITOR_LIMITS.alerts);
  return alert;
}
const resolve = (ws: MonitorWorkspace, kind: AlertKind, url: string | null, now: Date) => {
  for (const a of ws.alerts) if (!a.resolvedAt && a.kind === kind && a.url === url) a.resolvedAt = now.toISOString();
};

export type FetchResult = { url: string; status: number; html: string; xRobots: string | null } | null;
export type DailyDeps = {
  fetchPage: (url: string) => Promise<FetchResult>;
  fetchRobots: () => Promise<string | null>;
  /** When the site's TLS certificate expires (ISO), or null when it could not be read. */
  certExpiry?: () => Promise<string | null>;
  /** The newest finished audit and the one before it (new-errors alert). */
  audits?: () => Promise<{ latest: { id: string; report: ReportModel } | null; previous: ReportModel | null }>;
  /** Clicks per day from Search Console (oldest first), or null when not connected. */
  dailyClicks?: () => Promise<{ date: string; clicks: number }[] | null>;
  keyPages: string[];
};

const noindexIn = (r: NonNullable<FetchResult>) => {
  const meta = [...r.html.matchAll(/<meta[^>]+name=["'](?:robots|googlebot)["'][^>]*>/gi)].map((m) => m[0]).join(' ');
  return /noindex/i.test(meta) || /noindex/i.test(r.xRobots ?? '');
};

/** 13.4 The daily checks. Mutates and returns `ws`, plus the alerts it raised. */
export async function dailyChecks(ws: MonitorWorkspace, deps: DailyDeps, now = new Date()): Promise<{ ws: MonitorWorkspace; raised: MonitorAlert[] }> {
  const raised: MonitorAlert[] = [];
  const push = (a: MonitorAlert | null) => void (a && raised.push(a));
  const home = `https://${ws.domain}/`;

  // Down: two tries, so one slow answer does not page anyone.
  let r = await deps.fetchPage(home);
  if (!r || r.status >= 500) r = await deps.fetchPage(home);
  const down = !r || r.status >= 500;
  if (down && !ws.state.down) {
    ws.state.down = true;
    ws.state.downSince = now.toISOString();
    push(raise(ws, { kind: 'down', severity: 'critical', title: 'The website is down', detail: r ? `The homepage answers with error ${r.status}.` : 'The homepage does not answer.', url: home }, now));
  } else if (!down && ws.state.down) {
    const since = ws.state.downSince ? Math.max(1, Math.round((now.getTime() - Date.parse(ws.state.downSince)) / 3_600_000)) : null;
    ws.state.down = false;
    ws.state.downSince = null;
    resolve(ws, 'down', home, now);
    push(raise(ws, { kind: 'up', severity: 'info', title: 'The website is back up', detail: since ? `It was down for about ${since} hours (between two daily checks).` : 'The homepage loads again.', url: home }, now));
  }

  // robots.txt changes, and "Disallow: /" for every crawler.
  const robots = await deps.fetchRobots().catch(() => null);
  if (robots !== null) {
    const hash = hashText(robots);
    if (ws.state.robotsHash && ws.state.robotsHash !== hash) {
      const before = lines(ws.state.robotsBody);
      const after = lines(robots);
      const added = [...after].filter((l) => !before.has(l));
      const removed = [...before].filter((l) => !after.has(l));
      const blockAll = disallowsAll(robots) && !disallowsAll(ws.state.robotsBody);
      push(
        raise(ws, {
          kind: 'robots',
          severity: blockAll ? 'critical' : 'medium',
          title: blockAll ? 'robots.txt now blocks the whole site' : 'robots.txt changed',
          detail: [added.length && `Added: ${added.slice(0, 6).join(' · ')}`, removed.length && `Removed: ${removed.slice(0, 6).join(' · ')}`].filter(Boolean).join('. ') || 'The file changed.',
          url: `https://${ws.domain}/robots.txt`,
        }, now),
      );
    }
    ws.state.robotsHash = hash;
    ws.state.robotsBody = robots.slice(0, 20_000);
  }

  // noindex on the homepage and key pages.
  if (!down) {
    const pages = [...new Set([home, ...deps.keyPages])].slice(0, 8);
    const results = await Promise.all(pages.map(async (u) => (u === home ? r : await deps.fetchPage(u).catch(() => null))));
    const hidden = results.flatMap((x, i) => (x && x.status < 400 && noindexIn(x) ? [pages[i]!] : []));
    for (const u of hidden.filter((u) => !ws.state.noindex.includes(u))) {
      push(raise(ws, { kind: 'noindex', severity: u === home ? 'critical' : 'high', title: 'A key page is hidden from Google (noindex)', detail: `${u} has a noindex tag, so Google will drop it from search.`, url: u }, now));
    }
    for (const u of ws.state.noindex.filter((u) => !hidden.includes(u))) resolve(ws, 'noindex', u, now);
    ws.state.noindex = hidden;
  }

  // Traffic drop: the last 7 days of Search Console clicks against the 7 before.
  const days = deps.dailyClicks ? await deps.dailyClicks().catch(() => null) : null;
  if (days && days.length >= 14) {
    const last = days.slice(-7).reduce((s, d) => s + d.clicks, 0);
    const prev = days.slice(-14, -7).reduce((s, d) => s + d.clicks, 0);
    const drop = prev ? Math.round(((prev - last) / prev) * 100) : 0;
    if (prev >= 20 && drop >= 40) {
      const recent = ws.alerts.some((a) => a.kind === 'traffic' && now.getTime() - Date.parse(a.at) < 7 * 86_400_000);
      if (!recent) push(raise(ws, { kind: 'traffic', severity: 'high', title: `Clicks from Google fell ${drop}%`, detail: `${last} clicks in the last 7 days against ${prev} the week before (Search Console, ${days.at(-1)!.date}).`, url: null }, now));
    }
  }
  // SSL certificate: expired = critical, under 14 days = high.
  const expires = deps.certExpiry ? await deps.certExpiry().catch(() => null) : null;
  if (expires) {
    ws.state.sslExpires = expires;
    const days = Math.floor((Date.parse(expires) - now.getTime()) / 86_400_000);
    if (days < 0) push(raise(ws, { kind: 'ssl', severity: 'critical', title: 'The SSL certificate has expired', detail: `It expired on ${expires.slice(0, 10)}. Browsers now warn visitors that the site is not secure.`, url: `https://${ws.domain}/` }, now));
    else if (days < 14) push(raise(ws, { kind: 'ssl', severity: 'high', title: `The SSL certificate expires in ${days} ${days === 1 ? 'day' : 'days'}`, detail: `Renew it before ${expires.slice(0, 10)} (most hosts renew automatically: check that renewal is working).`, url: `https://${ws.domain}/` }, now));
    else resolve(ws, 'ssl', `https://${ws.domain}/`, now);
  }

  // New problems since the previous audit (critical and high only).
  const a = deps.audits ? await deps.audits().catch(() => null) : null;
  if (a?.latest && a.latest.id !== ws.state.lastAuditId) {
    if (a.previous && ws.state.lastAuditId !== undefined) {
      const added = diffReports(a.previous, a.latest.report).added.filter((c) => c.issue.status === 'fail' && (c.issue.severity === 'critical' || c.issue.severity === 'high'));
      if (added.length) {
        push(raise(ws, {
          kind: 'errors',
          severity: added.some((c) => c.issue.severity === 'critical') ? 'critical' : 'high',
          title: `${added.length} new ${added.length === 1 ? 'problem' : 'problems'} since the last audit`,
          detail: added.slice(0, 5).map((c) => c.issue.title.client).join(' · '),
          url: null,
        }, now));
      }
    }
    ws.state.lastAuditId = a.latest.id;
  }
  ws.state.lastDaily = now.toISOString();
  return { ws, raised };
}

export type WeeklyDeps = {
  /** Position of the site in Google's top 10 for a keyword (null = not in the top 10). */
  rank?: (keyword: string) => Promise<{ position: number | null; cost: number }>;
  searchConsole?: () => Promise<{ clicks: number; impressions: number; position: number | null } | null>;
  analytics?: () => Promise<{ sessions: number; keyEvents: number } | null>;
  reviews?: () => Promise<{ reviews: number | null; rating: number | null; cost: number } | null>;
  score: number | null;
  aiShare: number | null;
};

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await fn(next);
  }));
}

/** 13.1 + 13.5 + 13.6 The weekly snapshot (the first one becomes the baseline) and rank tracking. */
export async function weeklyRun(ws: MonitorWorkspace, deps: WeeklyDeps, now = new Date()): Promise<{ ws: MonitorWorkspace; snapshot: Snapshot; raised: MonitorAlert[]; cost: number }> {
  let cost = 0;
  const raised: MonitorAlert[] = [];
  const positions: Record<string, number | null> = {};
  if (deps.rank && ws.ranks.keywords.length) {
    await pool(ws.ranks.keywords, 3, async (k) => {
      try {
        const r = await deps.rank!(k);
        cost += r.cost;
        positions[k] = r.position;
      } catch {
        // a failed check is left out of this week's point
      }
    });
  }
  const prevPoint = ws.ranks.history.at(-1);
  if (Object.keys(positions).length) ws.ranks.history = [...ws.ranks.history, { date: now.toISOString().slice(0, 10), positions }].slice(-MONITOR_LIMITS.history);
  if (prevPoint) {
    const fell = Object.entries(positions).filter(([k, p]) => {
      const before = prevPoint.positions[k];
      return before !== null && before !== undefined && before <= 10 && (p === null || p - before >= 5);
    });
    if (fell.length) {
      const a = raise(ws, { kind: 'rank', severity: 'medium', title: `${fell.length} tracked ${fell.length === 1 ? 'search' : 'searches'} dropped`, detail: fell.slice(0, 6).map(([k, p]) => `${k}: #${prevPoint.positions[k]} → ${p === null ? 'not in top 10' : `#${p}`}`).join(' · '), url: null }, now);
      if (a) raised.push(a);
    }
  }
  const [sc, ga, rv] = await Promise.all([
    deps.searchConsole ? deps.searchConsole().catch(() => null) : null,
    deps.analytics ? deps.analytics().catch(() => null) : null,
    deps.reviews ? deps.reviews().catch(() => null) : null,
  ]);
  cost += rv?.cost ?? 0;
  const prev = ws.snapshots.at(-1);
  if (rv && prev?.reviews != null && rv.reviews != null && rv.reviews > prev.reviews) {
    const a = raise(ws, { kind: 'reviews', severity: 'info', title: `${rv.reviews - prev.reviews} new Google ${rv.reviews - prev.reviews === 1 ? 'review' : 'reviews'}`, detail: `Now ${rv.reviews} reviews${rv.rating ? `, rated ${rv.rating.toFixed(1)}` : ''}. Reply to each one.`, url: null }, now);
    if (a) raised.push(a);
  }
  if (rv?.rating != null && prev?.rating != null && prev.rating - rv.rating >= 0.2) {
    const a = raise(ws, { kind: 'reviews', severity: 'medium', title: 'Google rating went down', detail: `${prev.rating.toFixed(1)} → ${rv.rating.toFixed(1)}. Check the newest reviews and reply.`, url: null }, now);
    if (a) raised.push(a);
  }
  const ranked = Object.values(positions);
  const snapshot: Snapshot = {
    date: now.toISOString().slice(0, 10),
    score: deps.score,
    clicks28: sc?.clicks ?? null,
    impressions28: sc?.impressions ?? null,
    position28: sc?.position ?? null,
    sessions28: ga?.sessions ?? null,
    leads28: ga?.keyEvents ?? null,
    tracked: ranked.length,
    top3: ranked.filter((p) => p !== null && p <= 3).length,
    top10: ranked.filter((p) => p !== null && p <= 10).length,
    aiShare: deps.aiShare,
    reviews: rv?.reviews ?? prev?.reviews ?? null,
    rating: rv?.rating ?? prev?.rating ?? null,
  };
  ws.snapshots = [...ws.snapshots.filter((s) => s.date !== snapshot.date), snapshot].slice(-MONITOR_LIMITS.snapshots);
  if (!ws.baseline) ws.baseline = snapshot;
  ws.state.lastWeekly = now.toISOString();
  return { ws, snapshot, raised, cost: Math.round(cost * 10_000) / 10_000 };
}

export type MetricChange = { id: keyof Snapshot; label: string; now: number | null; before: number | null; better: 'up' | 'down' };
const METRICS: { id: keyof Snapshot; label: string; better: 'up' | 'down' }[] = [
  { id: 'score', label: 'SEO health score', better: 'up' },
  { id: 'clicks28', label: 'Clicks from Google (28 days)', better: 'up' },
  { id: 'impressions28', label: 'Times shown in Google (28 days)', better: 'up' },
  { id: 'position28', label: 'Average position', better: 'down' },
  { id: 'leads28', label: 'Leads tracked (28 days)', better: 'up' },
  { id: 'top10', label: 'Tracked searches on page 1', better: 'up' },
  { id: 'top3', label: 'Tracked searches in the top 3', better: 'up' },
  { id: 'aiShare', label: 'Share of voice in AI answers (%)', better: 'up' },
  { id: 'reviews', label: 'Google reviews', better: 'up' },
];
export function compareSnapshots(now: Snapshot | null | undefined, before: Snapshot | null | undefined): MetricChange[] {
  if (!now) return [];
  return METRICS.map((m) => ({ ...m, now: (now[m.id] as number | null) ?? null, before: before ? ((before[m.id] as number | null) ?? null) : null })).filter((m) => m.now !== null || m.before !== null);
}
export const changeTone = (c: MetricChange): 'good' | 'bad' | 'same' => (c.now === null || c.before === null || c.now === c.before ? 'same' : (c.now > c.before) === (c.better === 'up') ? 'good' : 'bad');

/** 13.2 The weekly summary (email and dashboard): this week against last week, and open alerts. */
export function weeklySummary(ws: MonitorWorkspace): { headline: string; lines: string[] } {
  const [a, b] = [ws.snapshots.at(-1), ws.snapshots.at(-2)];
  const changes = compareSnapshots(a, b).filter((c) => c.before !== null && c.now !== null && c.now !== c.before);
  const open = ws.alerts.filter((x) => !x.resolvedAt && x.kind !== 'up' && x.kind !== 'reviews');
  const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(1));
  const lines = [
    ...changes.map((c) => `${c.label}: ${fmt(c.before!)} → ${fmt(c.now!)}${changeTone(c) === 'good' ? ' ✓' : ''}`),
    ...open.slice(0, 5).map((x) => `Open alert: ${x.title}`),
  ];
  const good = changes.filter((c) => changeTone(c) === 'good').length;
  const bad = changes.filter((c) => changeTone(c) === 'bad').length;
  const headline = !b ? 'Your first weekly snapshot is in: this is your starting point.' : good > bad ? 'A good week: more went up than down.' : bad > good ? 'A mixed week: a few numbers went down.' : 'A steady week.';
  return { headline, lines: lines.length ? lines : ['No change worth reporting this week.'] };
}

export type MonthlyReport = {
  domain: string;
  month: string;
  from: Snapshot | null;
  to: Snapshot | null;
  changes: MetricChange[];
  winners: { keyword: string; before: number | null; now: number | null }[];
  losers: { keyword: string; before: number | null; now: number | null }[];
  alerts: MonitorAlert[];
  actionsDone: { title: string; doneAt: string }[];
  actionsOpen: number;
};

/** 13.3 One month: the last snapshot of the month against the last one before it (or the baseline). */
export function monthlyReport(ws: MonitorWorkspace, month: string, actions: { done: { title: string; doneAt: string }[]; open: number }): MonthlyReport {
  const inMonth = ws.snapshots.filter((s) => s.date.startsWith(month));
  const before = ws.snapshots.filter((s) => s.date < `${month}-01`).at(-1) ?? (ws.baseline && ws.baseline.date < `${month}-01` ? ws.baseline : inMonth[0] ?? null);
  const to = inMonth.at(-1) ?? null;
  const pts = ws.ranks.history;
  const start = pts.filter((p) => p.date < `${month}-01`).at(-1) ?? pts.find((p) => p.date.startsWith(month));
  const end = pts.filter((p) => p.date.startsWith(month)).at(-1);
  const moves = end && start && end !== start
    ? Object.keys(end.positions).map((k) => ({ keyword: k, before: start.positions[k] ?? null, now: end.positions[k] ?? null })).filter((m) => m.before !== m.now)
    : [];
  const val = (p: number | null) => p ?? 101;
  return {
    domain: ws.domain,
    month,
    from: before && before !== to ? before : null,
    to,
    changes: compareSnapshots(to, before && before !== to ? before : null),
    winners: moves.filter((m) => val(m.now) < val(m.before)).sort((a, b) => val(b.before) - val(b.now) - (val(a.before) - val(a.now))).slice(0, 8),
    losers: moves.filter((m) => val(m.now) > val(m.before)).sort((a, b) => val(b.now) - val(b.before) - (val(a.now) - val(a.before))).slice(0, 8),
    alerts: ws.alerts.filter((a) => a.at.startsWith(month) && a.kind !== 'up'),
    actionsDone: actions.done.filter((a) => a.doneAt.startsWith(month)),
    actionsOpen: actions.open,
  };
}

/** The months that have a snapshot, newest first ("YYYY-MM"). */
export const reportMonths = (ws: MonitorWorkspace) => [...new Set(ws.snapshots.map((s) => s.date.slice(0, 7)))].sort().reverse();

/** 13.8 The next meeting after `from`, by cadence. */
export function nextMeeting(cadence: MeetingCadence, from: Date): string | null {
  const step = { none: 0, weekly: 7, fortnightly: 14, monthly: 0 }[cadence];
  if (cadence === 'none') return null;
  const d = new Date(from);
  if (cadence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCDate(d.getUTCDate() + step);
  return d.toISOString().slice(0, 10);
}
