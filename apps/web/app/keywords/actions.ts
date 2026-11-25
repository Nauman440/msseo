'use server';

import { revalidatePath } from 'next/cache';
import {
  addKeywords, clusterKeywords, COMPETITOR_COUNTRIES, COMPETITOR_LANGUAGES, competitorSearchesFromClusters, createKeywordClient, createOpenAiClient, dataforseoBalance, fillMetrics,
  addPrompt, editPrompt, generatePrompts, seedsKey, MAX_CLUSTER_SERPS, mergePrompts, normDomain, setTrackedPrompts, parseKeywordCsv, researchKeywords, SEED_LIMITS, setKeywordStatus, updateCluster, type KeywordStatus,
} from '@seo/core';
import { competitorAccess, getWorkspace, saveWorkspace } from '@/lib/competitors';
import { customerAudits } from '@/lib/customer-data';
import { getKeywordWorkspace, gscQueries, logUsage, researchCompetitors, saveKeywordWorkspace } from '@/lib/keywords';
import { providerConfig } from '@/lib/providers-config';
import { hit } from '@/lib/rate-limit';

/** Module 4 actions, shared by the team's and the customer's keyword pages. */
export type KeywordState = { error?: string; ok?: string };

const DAY = 24 * 60 * 60;
const pathsFor = (domain: string) => {
  revalidatePath(`/keywords/${domain}`);
  revalidatePath('/my/keywords');
};

async function guard(rawDomain: string) {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  return { domain, customer: viewer.kind === 'customer' };
}

/** Customers have daily limits per site; the team does not. */
async function allowed(customer: boolean, key: string, perDay: number) {
  return !customer || (await hit(key, perDay, DAY)).allowed;
}

/** DataForSEO client that counts calls and knows the balance before the run (to record what was really charged). */
async function dfs() {
  const { env } = providerConfig();
  if (!env) return null;
  const cfg = env.dataforseo;
  let calls = 0;
  const before = await dataforseoBalance(cfg);
  return {
    calls: () => calls,
    api: createKeywordClient({ ...cfg, log: (e) => void (e.provider === 'dataforseo' && calls++) }),
    /** The balance drop when it is larger than DataForSEO's per-call figures (they under-report Labs). */
    charged: async (reported: number) => {
      const after = before === null ? null : await dataforseoBalance(cfg);
      return before !== null && after !== null ? Math.max(reported, Math.round((before - after) * 10_000) / 10_000) : reported;
    },
  };
}

/** A short note about failed calls; the team is told when the DataForSEO balance is empty (HTTP 402). */
function problems(errors: string[], customer: boolean, what: string): string {
  if (!errors.length) return '';
  if (!customer && errors.some((e) => /\b402\b/.test(e))) return ` ${errors.length} ${what}: the DataForSEO balance is empty (top up at app.dataforseo.com).`;
  return ` (${errors.length} ${what}.)`;
}

const list = (form: FormData, name: string, max: number) => [...new Set(form.getAll(name).map((s) => String(s).trim()).filter(Boolean))].map((s) => s.slice(0, 80)).slice(0, max);

/** 4.1 Seeds: where, in which language, services, places, brands and extra topics. */
export async function saveKeywordSeedsAction(rawDomain: string, _prev: KeywordState, form: FormData): Promise<KeywordState> {
  const { domain } = await guard(rawDomain);
  const country = String(form.get('country') ?? '');
  const language = String(form.get('language') ?? '');
  if (!(COMPETITOR_COUNTRIES as readonly string[]).includes(country)) return { error: 'Choose a country from the list.' };
  if (!(language in COMPETITOR_LANGUAGES)) return { error: 'Choose a language from the list.' };
  const businessType = form.get('businessType') === 'shop' ? 'shop' : 'services';
  const seeds = {
    services: list(form, 'services', SEED_LIMITS.services),
    locations: businessType === 'shop' ? [] : list(form, 'locations', SEED_LIMITS.locations),
    brands: list(form, 'brands', SEED_LIMITS.brands),
    extra: list(form, 'extra', SEED_LIMITS.extra),
  };
  if (!seeds.services.length) return { error: businessType === 'shop' ? 'Add at least one product or category (press Enter after each).' : 'Add at least one service (press Enter after each).' };
  const ws = await getKeywordWorkspace(domain);
  await saveKeywordWorkspace({ ...ws, businessType, country, language, seeds });
  pathsFor(domain);
  return { ok: 'Saved.' };
}

/** 4.2–4.6 Collect, measure, clean, then group into clusters, in one click. Customers: once a day per site. */
export async function researchKeywordsAction(rawDomain: string): Promise<KeywordState> {
  const { domain, customer } = await guard(rawDomain);
  const ws = await getKeywordWorkspace(domain);
  if (!ws.seeds.services.length) return { error: ws.businessType === 'shop' ? 'Add your products first, then save.' : 'Add your services first, then save.' };
  if (!(await allowed(customer, `keywords-research:${domain}`, 1))) return { error: 'Keyword research runs once a day. Please try again tomorrow.' };
  const c = await dfs();
  if (!c) return { error: 'Keyword research is not available right now.' };
  const [competitors, gsc, audits] = await Promise.all([researchCompetitors(domain), gscQueries(domain), customerAudits(`https://${domain}/`)]);
  // The site's own pages (titles and H1s) keep the list about what this website really covers.
  const pageTitles = (audits.latest?.pages ?? []).flatMap((p) => [p.title ?? '', p.h1 ?? '']).filter(Boolean);
  const r = await researchKeywords(c.api, ws, { competitors: competitors.domains, competitorNames: competitors.names, gsc, pageTitles });
  const kept = r.workspace.keywords.filter((k) => k.status === 'kept').length;
  const cl = kept ? await clusterKeywords(c.api, r.workspace, { maxSerps: MAX_CLUSTER_SERPS }) : null;
  await saveKeywordWorkspace(cl?.workspace ?? r.workspace);
  await logUsage('dataforseo', c.calls(), await c.charged(r.cost + (cl?.cost ?? 0)));
  pathsFor(domain);
  if (!r.workspace.keywords.length && r.errors.length) return { error: customer ? 'Keyword research is not available right now. Please try again later.' : `Research did not work: ${r.errors[0]}` };
  const errors = [...r.errors, ...(cl?.errors ?? [])];
  const reused = !customer && r.reused ? ` ${r.reused} sources reused from the last 7 days.` : '';
  return { ok: `${r.added} new keywords, ${kept} kept after cleaning, ${cl?.workspace.clusters.length ?? 0} topics.${gsc.length ? ` Search Console: ${gsc.length} searches.` : ''}${reused}${problems(errors, customer, 'checks could not be read')}` };
}

/** 4.5–4.6 Group by shared Google results and score. Customers: twice a day. */
export async function clusterKeywordsAction(rawDomain: string): Promise<KeywordState> {
  const { domain, customer } = await guard(rawDomain);
  const ws = await getKeywordWorkspace(domain);
  if (!ws.keywords.some((k) => k.status === 'kept')) return { error: 'Research keywords first.' };
  if (!(await allowed(customer, `keywords-cluster:${domain}`, 2))) return { error: 'Clusters can be rebuilt twice a day.' };
  const c = await dfs();
  const r = await clusterKeywords(c?.api ?? null, ws, { maxSerps: MAX_CLUSTER_SERPS });
  await saveKeywordWorkspace(r.workspace);
  if (c) await logUsage('dataforseo', c.calls(), await c.charged(r.cost));
  pathsFor(domain);
  return { ok: `${r.workspace.clusters.length} topics (${r.serps} new Google checks).${problems(r.errors, customer, 'searches could not be checked')}` };
}

/** 4.7 Prompts people ask AI assistants. Customers: twice a day. */
export async function generatePromptsAction(rawDomain: string): Promise<KeywordState> {
  const { domain, customer } = await guard(rawDomain);
  const ws = await getKeywordWorkspace(domain);
  if (!ws.seeds.services.length) return { error: ws.businessType === 'shop' ? 'Add your products first, then save.' : 'Add your services first, then save.' };
  if (!(await allowed(customer, `keywords-prompts:${domain}`, 2))) return { error: 'Questions can be written twice a day.' };
  const openai = providerConfig().env?.openai;
  const r = await generatePrompts(openai ? createOpenAiClient(openai) : null, ws.seeds, domain, { businessType: ws.businessType, country: ws.country });
  await saveKeywordWorkspace({ ...ws, prompts: mergePrompts(ws.prompts, r.prompts), promptsAt: new Date().toISOString(), promptsSeeds: seedsKey(ws) });
  await logUsage('openai', r.tokens);
  pathsFor(domain);
  return { ok: `${r.prompts.length} questions written${r.usedAi ? '' : ' from templates'}.` };
}

export async function setKeywordStatusAction(rawDomain: string, term: string, status: KeywordStatus): Promise<void> {
  const { domain } = await guard(rawDomain);
  if (status !== 'kept' && status !== 'removed') return;
  await saveKeywordWorkspace(setKeywordStatus(await getKeywordWorkspace(domain), term, status));
  pathsFor(domain);
}

/** Add keywords by hand or from a CSV file; metrics are looked up straight away. */
export async function addKeywordsAction(rawDomain: string, _prev: KeywordState, form: FormData): Promise<KeywordState> {
  const { domain, customer } = await guard(rawDomain);
  const upload = form.get('file');
  const typed = String(form.get('terms') ?? '').split(/[\n,]+/);
  let terms = typed.map((t) => t.trim()).filter(Boolean);
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > 2_000_000) return { error: 'That file is too big (2 MB at most).' };
    terms = [...terms, ...parseKeywordCsv(await upload.text())];
  }
  if (!terms.length) return { error: 'Type some keywords or choose a CSV file.' };
  if (!(await allowed(customer, `keywords-add:${domain}`, 5))) return { error: 'You can add keywords 5 times a day.' };
  const ws = await getKeywordWorkspace(domain);
  const r = addKeywords(ws, terms, upload instanceof File && upload.size > 0 ? 'import' : 'manual');
  let next = r.workspace;
  const c = await dfs();
  if (c && r.added.length) {
    try {
      const filled = await fillMetrics(c.api, next, r.added);
      next = filled.workspace;
      await logUsage('dataforseo', c.calls(), await c.charged(filled.cost));
    } catch {
      // metrics come with the next research run
    }
  }
  await saveKeywordWorkspace(next);
  pathsFor(domain);
  return { ok: r.added.length ? `${r.added.length} keywords added.` : 'Those keywords are already in the list (kept).' };
}

/** 4.6 Hand-set business value / chance to rank for a cluster. */
export async function updateClusterAction(rawDomain: string, id: string, _prev: KeywordState, form: FormData): Promise<KeywordState> {
  const { domain } = await guard(rawDomain);
  const businessValue = Number(form.get('businessValue'));
  const rankingChance = Number(form.get('rankingChance'));
  const ws = await getKeywordWorkspace(domain);
  await saveKeywordWorkspace(updateCluster(ws, id, { ...(businessValue ? { businessValue } : {}), ...(rankingChance ? { rankingChance } : {}) }));
  pathsFor(domain);
  return { ok: 'Saved.' };
}

/** Feeds the best commercial clusters into Module 3 as the core searches. */
export async function sendClustersToCompetitorsAction(rawDomain: string): Promise<KeywordState> {
  const { domain } = await guard(rawDomain);
  const searches = competitorSearchesFromClusters(await getKeywordWorkspace(domain));
  if (!searches.length) return { error: 'Research keywords first: topics come from the research.' };
  const ws = await getWorkspace(domain);
  await saveWorkspace({ ...ws, searches });
  revalidatePath(`/competitors/${domain}`);
  revalidatePath('/my/competitors');
  return { ok: `${searches.length} searches sent to Competitors.` };
}

/** Questions for AI: add one by hand (kept when new questions are written). */
export async function addPromptAction(rawDomain: string, _prev: KeywordState, form: FormData): Promise<KeywordState> {
  const { domain } = await guard(rawDomain);
  const text = String(form.get('question') ?? '');
  if (text.trim().length < 8) return { error: 'Type the question as a customer would ask it.' };
  const ws = await getKeywordWorkspace(domain);
  const service = String(form.get('topic') ?? '').trim() || null;
  const r = addPrompt(ws.prompts, text, service);
  if (!r.added) return { error: 'That question is already in the list (or the list is full).' };
  await saveKeywordWorkspace({ ...ws, prompts: r.prompts });
  pathsFor(domain);
  return { ok: 'Question added.' };
}

export async function editPromptAction(rawDomain: string, id: string, text: string): Promise<KeywordState> {
  const { domain } = await guard(rawDomain);
  if (text.trim().length < 8) return { error: 'The question is too short.' };
  const ws = await getKeywordWorkspace(domain);
  await saveKeywordWorkspace({ ...ws, prompts: editPrompt(ws.prompts, id, text) });
  pathsFor(domain);
  return { ok: 'Saved.' };
}

/** Which questions are tracked in AI assistants (the ticked ones). */
export async function saveTrackedPromptsAction(rawDomain: string, ids: string[]): Promise<KeywordState> {
  const { domain } = await guard(rawDomain);
  const ws = await getKeywordWorkspace(domain);
  const next = setTrackedPrompts(ws.prompts, ids.slice(0, 200));
  await saveKeywordWorkspace({ ...ws, prompts: next });
  pathsFor(domain);
  const n = next.filter((p) => p.tracked !== false).length;
  return { ok: `${n} ${n === 1 ? 'question' : 'questions'} tracked.` };
}
