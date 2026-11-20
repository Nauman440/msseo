import { normTerm } from '../keywords/clean';
import type { KeywordWorkspace } from '../keywords/types';
import { pathOf, schemaFor, titleCase, type MappingWorkspace } from './mapping';
import { isQuestion, type PageBrief } from './page-map';

/**
 * Blog post ideas (step 15 of the keyword research flow): topics people ask questions about or want to
 * learn about, with no page of their own yet. Each idea comes with a writer's brief and links to the
 * service page it should send readers to.
 */
export type BlogIdea = {
  clusterId: string;
  title: string;
  mainKeyword: string;
  supporting: string[];
  volume: number;
  trafficPotential: number | null;
  priority: number;
  path: string;
  /** "People also ask" questions for its searches (FAQ). */
  faq: string[];
  /** The page on the site the article should link to (the matching service page), if any. */
  linkTo: string | null;
  /** Publish by this date for the busy season (YYYY-MM-DD). */
  liveBy: string | null;
};

export const MAX_BLOG_IDEAS = 30;
const slug = (s: string) => normTerm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'article';
const STOP = new Set(['how', 'what', 'why', 'when', 'where', 'which', 'who', 'can', 'does', 'do', 'is', 'are', 'should', 'will', 'my', 'the', 'an', 'of', 'to', 'for', 'in', 'on', 'and', 'it', 'its', 'worth', 'much', 'near', 'me', 'best', 'vs']);
const words = (s: string) => new Set(normTerm(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w)));

function headline(head: string): string {
  const t = head.trim();
  if (isQuestion(t)) return `${titleCase(t.charAt(0).toUpperCase() + t.slice(1)).replace(/\?*$/, '')}?`;
  return `${titleCase(t.charAt(0).toUpperCase() + t.slice(1))}: What You Need to Know`;
}

export function blogIdeas(kw: KeywordWorkspace, mapping: MappingWorkspace | null | undefined): BlogIdea[] {
  const rows = new Map((mapping?.rows ?? []).map((r) => [r.clusterId, r]));
  const kept = kw.keywords.filter((k) => k.status === 'kept');
  const mapped = (mapping?.rows ?? []).filter((r) => r.url && r.action !== 'create');
  const ideas: BlogIdea[] = [];
  for (const c of kw.clusters) {
    const informational = c.pageType === 'blog_post' || c.intent === 'informational' || isQuestion(c.head);
    if (!informational) continue;
    const row = rows.get(c.id);
    // A topic that already has a page of its own is not a new article.
    if (row?.url) continue;
    const members = kept.filter((k) => k.clusterId === c.id).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    const terms = new Set([c.head, ...members.map((m) => m.term)].map(normTerm));
    const faq = [
      ...(kw.questions ?? []).filter((q) => terms.has(normTerm(q.keyword))).map((q) => q.text),
      ...members.filter((m) => m.term !== c.head && isQuestion(m.term)).map((m) => `${m.term.charAt(0).toUpperCase()}${m.term.slice(1).replace(/\?*$/, '')}?`),
    ];
    // The service page sharing the most words with the topic gets the article's main link.
    const want = words(c.head);
    const link = mapped
      .map((r) => ({ r, n: [...words(`${r.primaryKeyword} ${r.topic}`)].filter((w) => want.has(w)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || b.r.priority - a.r.priority)[0]?.r.url ?? null;
    ideas.push({
      clusterId: c.id,
      title: headline(c.head),
      mainKeyword: c.head,
      supporting: members.map((m) => m.term).filter((t) => normTerm(t) !== normTerm(c.head)).slice(0, 8),
      volume: c.volume,
      trafficPotential: c.trafficPotential ?? null,
      priority: c.priority,
      path: `/blog/${slug(c.head)}/`,
      faq: [...new Set(faq)].slice(0, 6),
      linkTo: link,
      liveBy: c.seasonalDeadline,
    });
  }
  return ideas
    .sort((a, b) => b.priority - a.priority || (b.trafficPotential ?? b.volume) - (a.trafficPotential ?? a.volume))
    .slice(0, MAX_BLOG_IDEAS);
}

/** A writer's brief for one blog idea (same shape as a new page's brief, so the same view and .md export work). */
export function blogBrief(idea: BlogIdea, brand: string): PageBrief {
  const outline = idea.supporting.filter((t) => !isQuestion(t)).slice(0, 5).map((t) => titleCase(t.charAt(0).toUpperCase() + t.slice(1)));
  const meta = `${idea.title.replace(/\?$/, '')}: a clear answer from ${brand}, with the steps, costs and signs to look for.`.slice(0, 158);
  return {
    topic: idea.title,
    path: idea.path,
    pageType: 'Article',
    note: 'Answers a question your customers search for, and sends readers to your service page',
    title: `${idea.title} | ${brand}`.slice(0, 60),
    h1: idea.title,
    meta,
    mainKeyword: idea.mainKeyword,
    supporting: idea.supporting,
    outline: outline.length ? outline : ['The short answer', 'Step by step', 'When to call a professional'],
    faq: idea.faq,
    mustHave: ['A 40 to 80 word answer right under the H1', 'Author name and credentials', 'Steps, a list or a table', idea.linkTo ? `A link to ${pathOf(idea.linkTo)}` : 'A link to the matching service page'],
    linksFrom: [],
    schema: schemaFor('blog_post', [], idea.faq.length > 0),
    words: '1,200 to 1,800',
  };
}

export const blogIdeaFor = (ideas: BlogIdea[], id: string) => ideas.find((i) => i.clusterId === id) ?? null;
