import { request, type HttpLog } from '../providers/http';
import { z } from 'zod';
import type { PageContent } from '../audit/page-content';
import { phonesIn, schemaValues } from '../audit/content-signals';
import type { BacklinkAudit } from '../backlinks/backlinks';
import type { LocalAudit } from '../local/local';
import type { Locale } from '../providers/dataforseo-competitors';
import type { AiAnswer } from '../providers/dataforseo-ai';
import type { OpenAiClient } from '../providers/openai';
import type { ReportIssue } from '../types';

/**
 * Module 10 · AEO / AI search audit (spec §16.2) with weekly tracking. 10.1 AI crawler access
 * (robots.txt + rule 1.2.4) · 10.2 the tracked questions asked in ChatGPT, Perplexity and Google
 * AI Overviews · 10.3 who is mentioned and cited · 10.4 share of voice, with a weekly trend ·
 * 10.5 sources AI cites · 10.6 entity signals · 10.7 answer-ready content (rules 2.8.x) ·
 * 10.8 what ChatGPT says about the business vs the facts · 10.9 snippet and AI controls ·
 * 10.10 presence on directories, review sites, forums and the press (Modules 8 and 9).
 */
export type Assistant = 'chatgpt' | 'perplexity' | 'google';
export const ASSISTANT_LABEL: Record<Assistant, string> = { chatgpt: 'ChatGPT', perplexity: 'Perplexity', google: 'Google AI Overviews' };
export const AEO_LIMITS = { questions: 10 } as const;
/** ChatGPT ≈ $0.03, Perplexity ≈ $0.007, AI Overview ≈ $0.004 per question, plus one fact check. */
export const AEO_ESTIMATE_USD = 0.5;

export type Brand = { domain: string; name: string | null; you: boolean };
export type TrackedAnswer = { assistant: Assistant; prompt: string; shown: boolean; mentioned: string[]; cited: string[]; error?: string };
export type Share = { domain: string; you: boolean; mentions: number; share: number };
export type CrawlerRow = { bot: string; label: string; purpose: string; allowed: boolean; rule: string | null };
export type Signal = { id: string; label: string; ok: boolean; detail: string };
export type AccuracyRow = { topic: string; aiSays: string; actual: string; ok: boolean | null };

export type AeoAudit = {
  domain: string;
  runAt: string;
  costUsd: number;
  tokens: number;
  crawlers: CrawlerRow[];
  firewall: { status: string; message: string } | null;
  answers: TrackedAnswer[];
  share: Record<Assistant | 'all', Share[]>;
  sources: { domain: string; count: number }[];
  entity: Signal[];
  answerReady: { ruleId: string; label: string; status: string; message: string }[];
  accuracy: { question: string; answer: string; rows: AccuracyRow[]; summary: string } | null;
  controls: { url: string; issue: string }[];
  thirdParty: Signal[];
  notes: string[];
};
export type AeoHistoryPoint = { date: string; you: number; all: number; byAssistant: Partial<Record<Assistant, number>> };
export type AeoWorkspace = { domain: string; audit: AeoAudit | null; history: AeoHistoryPoint[] };
export const emptyAeo = (domain: string): AeoWorkspace => ({ domain, audit: null, history: [] });

/** 10.1 AI crawlers checked in robots.txt (search crawlers first: they decide whether you are shown). */
export const AI_BOTS: { bot: string; label: string; purpose: string }[] = [
  { bot: 'Googlebot', label: 'Google', purpose: 'Google Search and AI Overviews' },
  { bot: 'OAI-SearchBot', label: 'ChatGPT search', purpose: 'Shows your pages in ChatGPT answers' },
  { bot: 'ChatGPT-User', label: 'ChatGPT browsing', purpose: 'Opens your pages when a user asks' },
  { bot: 'PerplexityBot', label: 'Perplexity', purpose: 'Shows your pages in Perplexity answers' },
  { bot: 'Claude-SearchBot', label: 'Claude search', purpose: 'Shows your pages in Claude answers' },
  { bot: 'Bingbot', label: 'Bing / Copilot', purpose: 'Bing and Microsoft Copilot' },
  { bot: 'GPTBot', label: 'OpenAI training', purpose: 'Training only (blocking it is a choice)' },
  { bot: 'ClaudeBot', label: 'Anthropic training', purpose: 'Training only (blocking it is a choice)' },
  { bot: 'Google-Extended', label: 'Gemini training', purpose: 'Training only (blocking it is a choice)' },
  { bot: 'CCBot', label: 'Common Crawl', purpose: 'Open dataset used by many AI models' },
];

/** Whether robots.txt lets this crawler fetch the homepage (longest matching rule wins; Allow wins ties). */
export function robotsAllows(robots: string | null, bot: string, path = '/'): { allowed: boolean; rule: string | null } {
  if (!robots) return { allowed: true, rule: null };
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === 'allow', path: value });
    } else lastWasAgent = false;
  }
  const b = bot.toLowerCase();
  const named = groups.filter((g) => g.agents.some((a) => a !== '*' && b.includes(a)));
  const use = named.length ? named : groups.filter((g) => g.agents.includes('*'));
  const match = (rule: string) => {
    const re = new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
    return re.test(path);
  };
  const hits = use.flatMap((g) => g.rules).filter((r) => match(r.path)).sort((x, y) => y.path.length - x.path.length || Number(y.allow) - Number(x.allow));
  const top = hits[0];
  return { allowed: !top || top.allow, rule: top ? `${top.allow ? 'Allow' : 'Disallow'}: ${top.path}` : null };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};
const belongs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
/** Words that identify a brand in an answer: the domain, its name part (5+ letters) and the business name. */
export function brandTerms(b: Brand): string[] {
  const root = b.domain.split('.')[0]!;
  return [...new Set([b.domain, root.length >= 5 ? root : '', root.length >= 5 ? root.replace(/-/g, ' ') : '', b.name && b.name.length >= 4 ? b.name : ''].map((t) => t.toLowerCase().trim()).filter(Boolean))];
}

export function readAnswer(assistant: Assistant, prompt: string, answer: AiAnswer | null, brands: Brand[]): TrackedAnswer {
  if (!answer) return { assistant, prompt, shown: false, mentioned: [], cited: [] };
  const text = answer.text.toLowerCase();
  const hosts = [...new Set(answer.citations.map((c) => hostOf(c.url)).filter(Boolean))];
  return {
    assistant,
    prompt,
    shown: true,
    mentioned: brands.filter((b) => brandTerms(b).some((t) => text.includes(t)) || hosts.some((h) => belongs(h, b.domain))).map((b) => b.domain),
    cited: hosts,
  };
}

/** 10.4 Share of voice: each brand's mentions out of all brand mentions (per assistant and overall). */
export function shareOfVoice(answers: TrackedAnswer[], brands: Brand[]): AeoAudit['share'] {
  const calc = (list: TrackedAnswer[]): Share[] => {
    const counts = brands.map((b) => ({ domain: b.domain, you: b.you, mentions: list.filter((a) => a.mentioned.includes(b.domain)).length }));
    const total = counts.reduce((s, c) => s + c.mentions, 0) || 1;
    return counts.map((c) => ({ ...c, share: Math.round((c.mentions / total) * 1000) / 10 })).sort((a, b) => b.mentions - a.mentions || Number(b.you) - Number(a.you));
  };
  return { all: calc(answers), chatgpt: calc(answers.filter((a) => a.assistant === 'chatgpt')), perplexity: calc(answers.filter((a) => a.assistant === 'perplexity')), google: calc(answers.filter((a) => a.assistant === 'google')) };
}

export type AeoDeps = {
  chatGpt: (prompt: string, iso: string | undefined) => Promise<{ answer: AiAnswer; cost: number }>;
  perplexity: (prompt: string, iso: string | undefined) => Promise<{ answer: AiAnswer; cost: number }>;
  aiOverview: (question: string, l: Locale) => Promise<{ answer: AiAnswer | null; cost: number }>;
  robots?: (domain: string) => Promise<string | null>;
  pages?: (urls: string[]) => Promise<PageContent[]>;
  ai?: OpenAiClient | null;
};

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await fn(next);
  }));
}

/** 10.2–10.5 The tracked questions in each assistant (also the weekly tracking run). */
export async function trackQuestions(questions: string[], brands: Brand[], locale: Locale, iso: string | undefined, deps: Pick<AeoDeps, 'chatGpt' | 'perplexity' | 'aiOverview'>) {
  let cost = 0;
  const answers: TrackedAnswer[] = [];
  const jobs = questions.slice(0, AEO_LIMITS.questions).flatMap((q) => (['chatgpt', 'perplexity', 'google'] as Assistant[]).map((a) => ({ q, a })));
  await pool(jobs, 6, async ({ q, a }) => {
    try {
      const r = a === 'chatgpt' ? await deps.chatGpt(q, iso) : a === 'perplexity' ? await deps.perplexity(q, iso) : await deps.aiOverview(q, locale);
      cost += r.cost;
      answers.push(readAnswer(a, q, r.answer, brands));
    } catch (err) {
      answers.push({ assistant: a, prompt: q, shown: false, mentioned: [], cited: [], error: err instanceof Error ? err.message.slice(0, 120) : 'failed' });
    }
  });
  const order = (x: TrackedAnswer) => questions.indexOf(x.prompt) * 3 + ['chatgpt', 'perplexity', 'google'].indexOf(x.assistant);
  answers.sort((x, y) => order(x) - order(y));
  const counts = new Map<string, number>();
  for (const a of answers) for (const h of a.cited) counts.set(h, (counts.get(h) ?? 0) + 1);
  return { answers, cost, share: shareOfVoice(answers, brands), sources: [...counts].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count).slice(0, 20) };
}

export function historyPoint(share: AeoAudit['share'], at: Date): AeoHistoryPoint {
  const you = (list: Share[]) => list.find((s) => s.you)?.share ?? 0;
  return { date: at.toISOString().slice(0, 10), you: you(share.all), all: share.all.reduce((s, x) => s + x.mentions, 0), byAssistant: { chatgpt: you(share.chatgpt), perplexity: you(share.perplexity), google: you(share.google) } };
}

const SOCIAL = /facebook\.com|instagram\.com|linkedin\.com|youtube\.com|twitter\.com|x\.com|tiktok\.com|pinterest\.com|yelp\.|nextdoor\.com/;

/** 10.6 Signals that tell AI who the business is. */
export function entitySignals(home: PageContent | null, businessName: string | null, local: LocalAudit | null, pages: string[]): Signal[] {
  const schemaNames = home ? schemaValues(home, 'name') : [];
  const sameAs = home ? schemaValues(home, 'sameAs') : [];
  const orgSchema = Boolean(home?.schemaTypes.some((t) => /Organization|LocalBusiness|Business$|Contractor|Plumber|Electrician|Store|Dentist|Attorney/i.test(t)));
  const socialLinks = home ? [...new Set(home.links.filter((l) => !l.internal && SOCIAL.test(l.href)).map((l) => hostOf(l.href)))] : [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const names = [businessName, local?.profile?.title, schemaNames[0]].filter((x): x is string => Boolean(x));
  const consistent = names.length >= 2 && names.every((n) => norm(n).includes(norm(names[0]!).slice(0, 8)) || norm(names[0]!).includes(norm(n).slice(0, 8)));
  return [
    { id: 'name', label: 'Same business name everywhere', ok: consistent, detail: names.length ? [...new Set(names)].join(' · ') : 'No business name found' },
    { id: 'schema', label: 'Organization or LocalBusiness schema', ok: orgSchema, detail: orgSchema ? home!.schemaTypes.filter((t) => !/WebSite|WebPage|BreadcrumbList/.test(t)).slice(0, 3).join(', ') : 'Missing on the homepage' },
    { id: 'sameas', label: 'sameAs links to your profiles', ok: sameAs.length >= 2, detail: sameAs.length ? `${sameAs.length} profiles linked in schema` : 'None in schema' },
    { id: 'social', label: 'Social profiles linked from the site', ok: socialLinks.length >= 2, detail: socialLinks.length ? socialLinks.join(', ') : 'None found on the homepage' },
    { id: 'gbp', label: 'Google Business Profile', ok: Boolean(local?.profile), detail: local ? (local.profile ? `${local.profile.title}${local.profile.claimed ? ' (claimed)' : ''}` : 'Not found') : 'Run the local audit to check' },
    { id: 'about', label: 'About or team page', ok: pages.some((u) => /\/(about|about-us|team|our-team|our-story|who-we-are)(\/|$)/i.test(u)), detail: 'A page saying who is behind the business' },
  ];
}

const ANSWER_RULES: [string, string][] = [['2.8.1', 'Direct answer near the top'], ['2.8.2', 'FAQ section'], ['2.8.3', 'Lists, tables and steps'], ['2.8.4', 'Credentials shown'], ['1.2.4', 'Crawlers not blocked by firewall or CDN']];

/** 10.9 Settings that keep pages out of snippets and AI answers (often by mistake). */
export function snippetControls(pages: PageContent[]): { url: string; issue: string }[] {
  return pages.flatMap((p) => {
    const r = p.robots ?? '';
    const out: { url: string; issue: string }[] = [];
    if (/\bnosnippet\b/.test(r)) out.push({ url: p.url, issue: 'meta robots "nosnippet": no snippet or AI Overview text from this page' });
    const max = r.match(/max-snippet\s*:\s*(-?\d+)/)?.[1];
    if (max !== undefined && Number(max) >= 0 && Number(max) < 50) out.push({ url: p.url, issue: `meta robots "max-snippet:${max}": very short snippets only` });
    if (/\bnoindex\b/.test(r)) out.push({ url: p.url, issue: 'meta robots "noindex": not shown at all' });
    if ((p.dataNosnippet ?? 0) > 0) out.push({ url: p.url, issue: `${p.dataNosnippet} part${p.dataNosnippet === 1 ? '' : 's'} marked data-nosnippet` });
    return out;
  });
}

const accuracySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['rows', 'summary'],
  properties: {
    rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['topic', 'aiSays', 'actual', 'ok'], properties: { topic: { type: 'string' }, aiSays: { type: 'string' }, actual: { type: 'string' }, ok: { type: ['boolean', 'null'] } } } },
    summary: { type: 'string' },
  },
};
const accuracyParse = z.object({ rows: z.array(z.object({ topic: z.string(), aiSays: z.string(), actual: z.string(), ok: z.boolean().nullable() })), summary: z.string() });

export type BusinessFacts = { name: string; website: string; phone: string | null; address: string | null; services: string[]; places: string[]; rating: number | null };

/** 10.8 Compares what an AI answer says about the business with the facts (phone and website checked directly, the rest by OpenAI). */
export async function judgeAccuracy(answer: string, facts: BusinessFacts, ai: OpenAiClient | null | undefined): Promise<{ rows: AccuracyRow[]; summary: string; tokens: number }> {
  const text = answer.toLowerCase();
  const phones = phonesIn(answer).map((p) => p.slice(-10));
  const factPhone = facts.phone?.replace(/\D/g, '').slice(-10) ?? null;
  const rows: AccuracyRow[] = [
    { topic: 'Website', aiSays: text.includes(facts.website) ? facts.website : 'Not mentioned', actual: facts.website, ok: text.includes(facts.website) },
    { topic: 'Phone', aiSays: phones[0] ?? 'Not mentioned', actual: facts.phone ?? 'Unknown', ok: !phones.length || !factPhone ? null : phones.includes(factPhone) },
  ];
  if (!ai) return { rows, summary: 'Website and phone checked; the rest needs AI, which is not set up.', tokens: 0 };
  const r = await ai.generateJson({
    name: 'ai_answer_accuracy',
    system:
      'Compare what an AI assistant said about a business with the known facts. List up to 6 rows for name, address, services, areas served, rating and anything else it states. ' +
      'ok = true when it matches, false when it is wrong, null when the facts do not say. "summary": one plain-English sentence on whether the answer is accurate.',
    user: JSON.stringify({ answer: answer.slice(0, 3000), facts }),
    jsonSchema: accuracySchema,
    parse: accuracyParse,
    maxOutputTokens: 900,
    timeoutMs: 45_000,
  });
  return { rows: [...rows, ...r.data.rows.slice(0, 6).map((x) => ({ topic: x.topic.slice(0, 60), aiSays: x.aiSays.slice(0, 200), actual: x.actual.slice(0, 200), ok: x.ok }))], summary: r.data.summary.slice(0, 300), tokens: r.tokens };
}

export async function runAeoAudit(
  input: { domain: string; brands: Brand[]; questions: string[]; locale: Locale; iso: string | undefined; facts: BusinessFacts | null; issues: ReportIssue[] | null; pages: string[]; local: LocalAudit | null; backlinks: BacklinkAudit | null },
  deps: AeoDeps,
  now = new Date(),
): Promise<AeoAudit> {
  const notes: string[] = [];
  let cost = 0;
  let tokens = 0;
  const [robots, fetched, tracked] = await Promise.all([
    deps.robots ? deps.robots(input.domain).catch(() => null) : Promise.resolve(null),
    deps.pages ? deps.pages([`https://${input.domain}/`, ...input.pages.filter((u) => hostOf(u) === input.domain).slice(0, 9)]).catch(() => [] as PageContent[]) : Promise.resolve([] as PageContent[]),
    input.questions.length ? trackQuestions(input.questions, input.brands, input.locale, input.iso, deps) : Promise.resolve(null),
  ]);
  if (!input.questions.length) notes.push('No questions are ticked under Keywords → Questions for AI, so the assistants were not asked.');
  if (tracked) cost += tracked.cost;
  const failed = tracked?.answers.filter((a) => a.error).length ?? 0;
  if (failed) notes.push(`${failed} answers could not be read this time.`);

  const home = fetched.find((p) => hostOf(p.url) === input.domain && new URL(p.url).pathname.replace(/\/$/, '') === '') ?? fetched[0] ?? null;
  const crawlers = AI_BOTS.map((b) => ({ ...b, ...robotsAllows(robots, b.bot) }));
  const fw = input.issues?.find((i) => i.ruleId === '1.2.4');

  let accuracy: AeoAudit['accuracy'] = null;
  if (input.facts) {
    const question = `What can you tell me about ${input.facts.name}${input.facts.places[0] ? ` in ${input.facts.places[0]}` : ''} (${input.facts.website})? Include its phone number, address, services and rating.`;
    try {
      const r = await deps.chatGpt(question, input.iso);
      cost += r.cost;
      const j = await judgeAccuracy(r.answer.text, input.facts, deps.ai).catch(() => null);
      tokens += j?.tokens ?? 0;
      accuracy = { question, answer: r.answer.text.slice(0, 1500), rows: j?.rows ?? [], summary: j?.summary ?? 'The answer could not be checked.' };
    } catch {
      notes.push('ChatGPT could not be asked about the business this time.');
    }
  } else notes.push('Add the business name to check what AI says about it.');

  const listed = input.local?.citations.filter((c) => c.found) ?? [];
  const reviewSites = listed.filter((c) => /yelp|trustpilot|bbb|checkatrade|productreview|homestars/i.test(c.site));
  const press = input.backlinks?.domains.filter((d) => d.type === 'news') ?? [];
  const forums = (tracked?.sources ?? []).filter((s) => /reddit\.com|quora\.com|nextdoor\.com/.test(s.domain));
  const thirdParty: Signal[] = [
    { id: 'directories', label: 'Listed on directories', ok: listed.length >= 3, detail: input.local ? `${listed.length} of ${input.local.citations.length} (${listed.map((c) => c.label).join(', ') || 'none'})` : 'Run the local audit to check' },
    { id: 'reviews', label: 'On review sites', ok: reviewSites.length >= 1, detail: input.local ? reviewSites.map((c) => c.label).join(', ') || 'None found' : 'Run the local audit to check' },
    { id: 'press', label: 'Mentioned by news sites', ok: press.length >= 1, detail: input.backlinks ? (press.length ? press.slice(0, 5).map((d) => d.domain).join(', ') : 'No news sites link to you') : 'Run the backlink audit to check' },
    { id: 'forums', label: 'Forums AI cites in your niche', ok: forums.length === 0 || forums.some((f) => f.count > 0), detail: forums.length ? `AI cites ${forums.map((f) => f.domain).join(', ')}: join genuine conversations there` : 'AI did not cite forums for your questions' },
  ];

  return {
    domain: input.domain,
    runAt: now.toISOString(),
    costUsd: Math.round(cost * 10_000) / 10_000,
    tokens,
    crawlers,
    firewall: fw ? { status: fw.status, message: fw.message.client } : null,
    answers: tracked?.answers ?? [],
    share: tracked?.share ?? shareOfVoice([], input.brands),
    sources: tracked?.sources ?? [],
    entity: entitySignals(home, input.facts?.name ?? null, input.local, input.pages),
    answerReady: ANSWER_RULES.flatMap(([id, label]) => {
      const i = input.issues?.find((x) => x.ruleId === id);
      return i ? [{ ruleId: id, label, status: i.status, message: i.message.client }] : [];
    }),
    accuracy,
    controls: snippetControls(fetched),
    thirdParty,
    notes,
  };
}

/** 10.1 The site's robots.txt (null when there is none or it does not load). */
export async function fetchRobotsTxt(domain: string, log?: HttpLog): Promise<string | null> {
  try {
    const res = await request(`https://${domain}/robots.txt`, { provider: 'site', headers: { 'user-agent': 'Mozilla/5.0 (compatible; MSScore/1.0; +https://msseo.tech)' }, timeoutMs: 8000, retries: 0, log });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    return (await res.text()).slice(0, 200_000);
  } catch {
    return null;
  }
}
