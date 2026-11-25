import { z } from 'zod';
import type { OpenAiClient } from '../providers/openai';

/**
 * The customer help assistant: answers "how do I…" questions about MS SCORE (connecting Google Search
 * Console and Analytics, connecting WordPress or Shopify, approvals, reports, plans) from the help topics
 * below and the customer's own setup (which connections are done). OpenAI writes the answer; without it,
 * the best matching topic is returned. Links are page ids from a fixed list, never addresses the model
 * makes up. No Search Console or Analytics data is ever sent: only whether things are connected.
 */
export const SUPPORT_PAGES = {
  overview: { label: 'Overview', path: '/my', site: true },
  connections: { label: 'Connections', path: '/my/connections', site: true },
  choose_properties: { label: 'Choose Google properties', path: '/my/connect', site: true },
  website_connection: { label: 'Connect your website', path: '/my/connections#website', site: true },
  issues: { label: 'Your audits', path: '/my/reports', site: true },
  keywords: { label: 'Keywords', path: '/my/keywords', site: true },
  research_inputs: { label: 'Research inputs', path: '/my/keywords?view=inputs', site: true },
  page_mapping: { label: 'Page mapping', path: '/my/keywords?view=mapping', site: true },
  competitors: { label: 'Competitors', path: '/my/competitors', site: true },
  action_plan: { label: 'Action plan', path: '/my/actions', site: true },
  approvals: { label: 'Approvals', path: '/my/approvals', site: false },
  reports: { label: 'Reports', path: '/my/reports', site: true },
  content: { label: 'Content', path: '/my/content', site: true },
  local: { label: 'Local', path: '/my/local', site: true },
  backlinks: { label: 'Backlinks', path: '/my/backlinks', site: true },
  monitoring: { label: 'Monitoring', path: '/my/monitor', site: true },
  alerts: { label: 'Alerts', path: '/my/alerts', site: false },
  websites: { label: 'Manage websites', path: '/my/sites', site: false },
  account: { label: 'Account settings', path: '/my/account', site: false },
  plan_billing: { label: 'Plan and billing', path: '/my/account#plan', site: false },
  wordpress_plugin: { label: 'Download the WordPress plugin', path: '/downloads/msscore-connector.zip', site: false },
  search_console: { label: 'Open Google Search Console', path: 'https://search.google.com/search-console', site: false },
  google_analytics: { label: 'Open Google Analytics', path: 'https://analytics.google.com/', site: false },
  google_permissions: { label: 'Google account permissions', path: 'https://myaccount.google.com/permissions', site: false },
} as const;
export type SupportPage = keyof typeof SUPPORT_PAGES;
const PAGE_IDS = Object.keys(SUPPORT_PAGES) as SupportPage[];

/** Turns a page id into a link for one website (adds ?site= where the page is per website). */
export function supportHref(id: SupportPage, domain: string | null): string {
  const p = SUPPORT_PAGES[id];
  if (!p.site || !domain) return p.path;
  const [path, hash] = p.path.split('#');
  const sep = path!.includes('?') ? '&' : '?';
  return `${path}${sep}site=${encodeURIComponent(domain)}${hash ? `#${hash}` : ''}`;
}

export type HelpTopic = { id: string; title: string; words: string[]; answer: string; links: SupportPage[] };

/** What the assistant knows about the product. Keep in step with the screens' wording. */
export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'connect-search-console',
    title: 'Connect Google Search Console and Analytics',
    words: ['search console', 'gsc', 'google', 'connect', 'analytics', 'ga4', 'link', 'property'],
    answer:
      '1. Open the Connections tab for your website and press "Connect Google".\n2. Sign in with the Google account that can see your website in Search Console, and allow read-only access. We never change anything in your Google accounts.\n3. On "Choose what to connect", pick your Search Console property (the domain property is listed first when there is one) and, if you use it, your Google Analytics 4 property. You can press "Skip Analytics".\n4. Save. Your dashboard, weekly plan and rankings unlock, and the next audits and keyword research use this data.',
    links: ['connections', 'choose_properties'],
  },
  {
    id: 'property-missing',
    title: 'My website is not in the Search Console list',
    words: ['not listed', 'missing', 'no property', 'not showing', 'cannot find', 'empty list', 'verify', 'access', 'permission', 'owner'],
    answer:
      'The list only shows properties your Google account can see.\n1. Open Google Search Console with the same Google account and check the website is there.\n2. If it is not: add it there ("Add property"). A Domain property is best (verify with a DNS TXT record at your domain provider); a URL-prefix property can be verified with an HTML tag or file.\n3. If someone else manages it: ask them to add your Google account under Settings → Users and permissions → Add user (Full or Restricted is enough).\n4. Then come back, open Connections and press "Change properties" (or connect again).',
    links: ['search_console', 'choose_properties', 'connections'],
  },
  {
    id: 'no-data',
    title: 'Search Console is connected but shows no data',
    words: ['no data', 'zero', '0 clicks', 'empty', 'not updating', 'delay', 'nothing'],
    answer:
      'Google\'s numbers arrive about 2 to 3 days late, so the newest days are always missing. A property that was only just added in Search Console has no history yet: data starts building from the day it was verified. Check that you chose the property for this exact website (with or without www, http or https) under Connections → "Change properties". Our pages refresh Google data every 30 minutes.',
    links: ['choose_properties', 'connections'],
  },
  {
    id: 'connect-wordpress',
    title: 'Connect a WordPress website',
    words: ['wordpress', 'wp', 'plugin', 'connector', 'application password', 'authorize'],
    answer:
      '1. Open Connections and find "Connect your website".\n2. Under WordPress, check the site address and press "Connect WordPress".\n3. WordPress opens its own "Authorize application" screen: sign in as an editor or administrator and approve. The site must use https.\n4. Install our small plugin: download it, then in WordPress go to Plugins → Add New → Upload Plugin, choose the file, Install, then Activate.\nAfter that, approved changes (SEO titles, meta descriptions, page titles and redirects) can be applied with one click, and undone.',
    links: ['website_connection', 'wordpress_plugin'],
  },
  {
    id: 'connect-shopify',
    title: 'Connect a Shopify store',
    words: ['shopify', 'store', 'myshopify', 'shop'],
    answer:
      '1. Open Connections and find "Connect your website".\n2. Under Shopify, type your store\'s Shopify address (like your-store.myshopify.com, found in Shopify admin → Settings → Domains) and press "Connect Shopify".\n3. Approve the app in Shopify. It never edits your theme.\nThe store\'s main domain must be the website you audit here.',
    links: ['website_connection'],
  },
  {
    id: 'approvals',
    title: 'Approve and apply changes',
    words: ['approve', 'approval', 'apply', 'undo', 'changes', 'fix', 'fixes'],
    answer:
      'Changes that need your OK wait under Approvals in the menu. Open one, read what will change and approve it. When your website is connected, an approved change can be applied with "Apply" (titles, meta descriptions, page titles, redirects, draft pages) and taken back with "Undo". Text changes such as new sections or FAQ answers are drafted for a person to add.',
    links: ['approvals', 'action_plan', 'website_connection'],
  },
  {
    id: 'action-plan',
    title: 'The 6-month action plan',
    words: ['action plan', 'plan', 'roadmap', 'six month', '6 month', 'tasks', 'to do'],
    answer:
      'Your action plan lists every fix from your audits and keyword plan, spread over six months with the most valuable first. Each one shows its status and who approves it. Mark items done as you go: we check the results after 7, 14 and 28 days. You can download the whole plan as a PDF from the Reports tab.',
    links: ['action_plan', 'reports'],
  },
  {
    id: 'reports',
    title: 'Reports and PDFs',
    words: ['report', 'reports', 'pdf', 'download', 'weekly', 'monthly', 'export'],
    answer:
      'The Reports tab has a report for every week (after the Monday check), one combined report for each whole month, and your 6-month action plan, each to open or download as a PDF. Each audit report (Issues tab) also has "Download PDF" and "Download .md".',
    links: ['reports', 'issues'],
  },
  {
    id: 'run-audit',
    title: 'Run a new audit',
    words: ['audit', 'run', 'rerun', 're-run', 'scan', 'check again', 'score'],
    answer:
      'Press "Run audit again" at the top of your website\'s pages. You can run 2 audits a day per website, and we also re-check every website every Monday by ourselves. A quick audit takes about a minute.',
    links: ['overview', 'issues'],
  },
  {
    id: 'keywords',
    title: 'Keywords, topics and page mapping',
    words: ['keyword', 'keywords', 'topic', 'topics', 'research', 'mapping', 'services', 'places', 'research inputs'],
    answer:
      'Keywords are prepared for you automatically from your services and places. To change what we research, open Keywords → Research inputs, edit your services and places, save, then press "Update keywords". Page mapping shows which page should win each topic, which new pages to create (with a ready brief) and blog post ideas.',
    links: ['keywords', 'research_inputs', 'page_mapping'],
  },
  {
    id: 'add-website',
    title: 'Add or switch websites',
    words: ['add website', 'another website', 'second site', 'switch', 'other site', 'websites'],
    answer:
      'Use the Website switcher at the top of every page to move between your websites; "+ Add a website" is in the same list when your plan has room (Growth covers up to 3). Each website keeps its own competitors, keywords and reports.',
    links: ['websites'],
  },
  {
    id: 'business-profile',
    title: 'Google Business Profile',
    words: ['business profile', 'gmb', 'gbp', 'maps', 'reviews', 'review', 'local'],
    answer:
      'Open the Local tab. Paste your Google Maps link (or place ID) so we check the right profile, then you can connect the Google account that manages it to answer reviews and publish posts. Nothing is posted until you press Post or Publish.',
    links: ['local'],
  },
  {
    id: 'billing',
    title: 'Plan, trial and billing',
    words: ['plan', 'billing', 'trial', 'cancel', 'invoice', 'price', 'upgrade', 'downgrade', 'payment'],
    answer:
      'Open Account → Plan to see your plan, trial end date and websites used. You can switch between Autopilot and Growth, cancel (your reports and login are kept) or restart. Invoices are sent by our team.',
    links: ['plan_billing'],
  },
  {
    id: 'disconnect',
    title: 'Disconnect Google or change access',
    words: ['disconnect', 'remove access', 'revoke', 'change account'],
    answer:
      'Open Connections and press "Disconnect Google": the stored access is deleted and past reports are kept. You can also remove access from your Google account\'s permissions page. Connect again any time with a different Google account.',
    links: ['connections', 'google_permissions'],
  },
  {
    id: 'alerts',
    title: 'Alerts and monitoring',
    words: ['alert', 'alerts', 'down', 'noindex', 'robots', 'monitor', 'monitoring', 'email'],
    answer:
      'We check your website every morning (down, pages hidden from Google, robots.txt changes, traffic drops, SSL certificate) and every Monday (rankings, reviews). Problems appear under Alerts and are emailed to you. Mark an alert handled once it is fixed.',
    links: ['alerts', 'monitoring'],
  },
];

export type SupportSite = {
  domain: string;
  googleConnected: boolean;
  searchConsoleChosen: boolean;
  analyticsChosen: boolean;
  website: 'not connected' | 'wordpress' | 'wordpress without plugin' | 'shopify';
  lastAudit: string | null;
  nextStep: string | null;
};
export type SupportContext = { name: string; plan: string; status: string; trialDaysLeft: number | null; current: string | null; sites: SupportSite[] };
export type SupportMessage = { role: 'user' | 'assistant'; text: string };
export type SupportReply = { answer: string; links: { label: string; href: string }[]; suggestions: string[]; escalate: boolean; ai: boolean; tokens: number };

export const SUPPORT_LIMITS = { messages: 12, chars: 800, perDay: 30 } as const;
export const SUPPORT_STARTERS = [
  'How do I connect Google Search Console?',
  'My website is not in the Search Console list',
  'How do I connect my WordPress site?',
  'How do I approve and apply changes?',
  'Where can I download my reports?',
];

const PROBLEM = / (not|missing|why|error|cannot|can t|cant|isn t|doesn t|no|wrong|failed|broken) /;
const TROUBLESHOOTING = new Set(['property-missing', 'no-data']);
const norm = (s: string) =>` ${s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;

/** The best help topic for a question by shared words (the answer when OpenAI is not available). */
export function matchTopic(question: string): HelpTopic | null {
  const q = norm(question);
  let best: HelpTopic | null = null;
  let score = 0;
  // "not", "missing", "why"…: the customer has a problem, so the troubleshooting topics win a tie.
  const problem = PROBLEM.test(q);
  for (const t of HELP_TOPICS) {
    const base = t.words.reduce((n, w) => n + (q.includes(` ${w} `) || (w.includes(' ') && q.includes(w)) ? (w.includes(' ') ? 2 : 1) : 0), 0);
    const s = base + (base > 0 && problem && TROUBLESHOOTING.has(t.id) ? 1.5 : 0);
    if (s > score) [best, score] = [t, s];
  }
  return best;
}

const linksFor = (ids: readonly string[], domain: string | null) =>
  [...new Set(ids)].filter((id): id is SupportPage => (PAGE_IDS as string[]).includes(id)).slice(0, 4).map((id) => ({ label: SUPPORT_PAGES[id].label, href: supportHref(id, domain) }));

/** Answer from the help topics alone (no AI). */
export function topicReply(question: string, domain: string | null): SupportReply {
  const t = matchTopic(question);
  if (!t) {
    return {
      answer: 'I could not find a help topic for that. Try one of the questions below, or press "Ask a person" and our team will answer by email.',
      links: [],
      suggestions: SUPPORT_STARTERS.slice(0, 3),
      escalate: true,
      ai: false,
      tokens: 0,
    };
  }
  return { answer: t.answer, links: linksFor(t.links, domain), suggestions: HELP_TOPICS.filter((x) => x.id !== t.id).slice(0, 3).map((x) => x.title), escalate: false, ai: false, tokens: 0 };
}

function contextText(ctx: SupportContext, domain: string | null): string {
  const site = ctx.sites.find((s) => s.domain === domain) ?? ctx.sites[0];
  return [
    `Customer: ${ctx.name}. Plan: ${ctx.plan} (${ctx.status}${ctx.trialDaysLeft !== null ? `, ${ctx.trialDaysLeft} trial days left` : ''}). Page open now: ${ctx.current ?? 'unknown'}.`,
    `Websites: ${ctx.sites.map((s) => s.domain).join(', ') || 'none'}.`,
    site
      ? `Website being viewed: ${site.domain}. Google connected: ${site.googleConnected ? 'yes' : 'no'}. Search Console property chosen: ${site.searchConsoleChosen ? 'yes' : 'no'}. Analytics 4 chosen: ${site.analyticsChosen ? 'yes' : 'no'}. Website connection: ${site.website}. Last audit: ${site.lastAudit ?? 'none yet'}. Next step of the setup: ${site.nextStep ?? 'all steps done'}.`
      : '',
  ].join('\n');
}

const SYSTEM = `You are the MS SCORE help assistant for customers of an SEO tool (MS SCORE by Morosoft Technologies).
Answer only questions about using MS SCORE and the Google, WordPress and Shopify setup it needs. For anything else (general SEO consulting beyond the tool, legal, billing disputes, refunds, bugs you cannot explain), say briefly that the team will help and set escalate to true.
Rules:
- Use only the help topics and the customer's setup below. Never invent features, prices, buttons or menu names. If unsure, say so and set escalate to true.
- Plain English, no jargon, short. Numbered steps (one per line, "1. …") for how-to answers. At most 120 words.
- Use the customer's setup: if Google is not connected and they ask about Search Console, start from connecting; if it is connected, skip that.
- links: page ids from the allowed list that help the customer do the next step (0 to 3). Never write addresses in the answer text.
- suggestions: up to 3 short follow-up questions the customer might ask next.`;

const replySchema = z.object({
  answer: z.string(),
  links: z.array(z.string()),
  suggestions: z.array(z.string()),
  escalate: z.boolean(),
});
const replyJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'links', 'suggestions', 'escalate'],
  properties: {
    answer: { type: 'string' },
    links: { type: 'array', items: { type: 'string', enum: PAGE_IDS } },
    suggestions: { type: 'array', items: { type: 'string' } },
    escalate: { type: 'boolean' },
  },
};

/** Trims the conversation to the last messages and a safe length each. */
export function cleanConversation(messages: SupportMessage[]): SupportMessage[] {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .slice(-SUPPORT_LIMITS.messages)
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, SUPPORT_LIMITS.chars) }));
}

/** One answer for the latest question; falls back to the help topics when OpenAI fails or is missing. */
export async function supportReply(client: OpenAiClient | null, messages: SupportMessage[], ctx: SupportContext, domain: string | null): Promise<SupportReply> {
  const convo = cleanConversation(messages);
  const question = [...convo].reverse().find((m) => m.role === 'user')?.text ?? '';
  if (!question) return topicReply('', domain);
  if (!client) return topicReply(question, domain);
  const topics = HELP_TOPICS.map((t) => `## ${t.title}\n${t.answer}\nUseful pages: ${t.links.join(', ')}`).join('\n\n');
  try {
    const r = await client.generateJson({
      system: `${SYSTEM}\n\nAllowed page ids: ${PAGE_IDS.join(', ')}.\n\nHelp topics:\n${topics}`,
      user: `Customer setup:\n${contextText(ctx, domain)}\n\nConversation so far:\n${convo.map((m) => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.text}`).join('\n')}\n\nAnswer the customer's last message.`,
      name: 'support_reply',
      jsonSchema: replyJsonSchema,
      parse: replySchema,
      maxOutputTokens: 900,
      timeoutMs: 45_000,
    });
    return {
      answer: r.data.answer.trim().slice(0, 2000) || topicReply(question, domain).answer,
      links: linksFor(r.data.links, domain),
      suggestions: r.data.suggestions.map((s) => s.trim()).filter(Boolean).slice(0, 3),
      escalate: r.data.escalate,
      ai: true,
      tokens: r.tokens,
    };
  } catch {
    return topicReply(question, domain);
  }
}
