import type { ReportModel } from '../types';
import type { AiPlanTask, PlanExtras, TaskCategory } from './ai-plan';

/**
 * Rule 31: tasks the plan can add when a month holds fewer than the minimum. Every one comes from a
 * finding (an audit issue, a page the content audit marks, a gap in AI search), names its pages and is
 * done by the SEO team, so it never uses the automatic-change capacity.
 */
export type TopUpCandidate = { task: AiPlanTask; /** First month it may go in. */ earliest: number };

/** Rules the site-wide clean-up already covers (titles, descriptions, H1, canonical, alt text). */
const CLEANUP_RULES = /^(2\.1\.[123]|2\.2\.[12]|2\.3\.1|1\.6\.1|2\.5\.2)(-|$)/;
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

function categoryOf(ruleId: string): TaskCategory {
  if (/^2\.8\.|^1\.2\.4/.test(ruleId)) return 'ai_visibility';
  if (/^2\.7\./.test(ruleId)) return 'on_page';
  if (/^2\.(4|5|9)\./.test(ruleId)) return 'content';
  if (/^2\./.test(ruleId)) return 'on_page';
  return 'technical';
}

const task = (o: Partial<AiPlanTask> & Pick<AiPlanTask, 'title' | 'why' | 'change' | 'category' | 'success_check'>): AiPlanTask => ({
  id: 'topup', week: 2, urls: [], keywords: [], doer: 'team', impact: 3, confidence: 3, effort: 2, priority: 0, depends_on: [], check_after_days: 28,
  site_wide_item: 'none', page_group: 'none', area: '', issue_ids: [], recurring: false, ...o,
});

export function topUpCandidates(args: { report: ReportModel | null; extras?: PlanExtras; prompts?: string[]; domain: string }): TopUpCandidate[] {
  const out: TopUpCandidate[] = [];
  const content = args.extras?.content ?? null;
  const ai = args.extras?.aiSearch ?? null;

  // G. Content optimisation, one page per task.
  for (const r of content?.pages ?? []) {
    if (r.verdict === 'improve') {
      out.push({
        earliest: r.position !== null && r.position <= 10 ? 1 : 2,
        task: task({
          title: `Improve the content of ${path(r.url)}`, urls: [r.url], category: 'content', week: 2,
          why: r.reason,
          change: 'Compare the page with the pages that rank for its main keyword and add what it is missing: sections on the subtopics they cover, the questions people ask, a 40–80 word direct answer under the H1, prices or specifications, proof, an updated date and internal links.',
          impact: (r.clicks ?? 0) > 0 ? 4 : 3, effort: 3,
          success_check: 'Higher average position and more clicks for the page in Search Console.',
        }),
      });
    } else if (r.verdict === 'merge') {
      out.push({
        earliest: 2,
        task: task({
          title: `Merge ${path(r.url)} into the main page`, urls: [r.url], category: 'content', week: 3,
          why: r.reason,
          change: 'Move anything useful from this page into the main page for the topic, then redirect this address there (301).',
          impact: 3, effort: 3,
          success_check: 'Only the main page shows in Google for the topic, and its clicks grow.',
        }),
      });
    }
  }
  for (const r of content?.decay ?? []) {
    out.push({
      earliest: 2,
      task: task({
        title: `Refresh ${path(r.url)}: it is losing clicks`, urls: [r.url], category: 'content', week: 1,
        why: `Clicks ${r.change !== null ? `down ${-r.change}%` : 'falling'} on the previous 90 days.`,
        change: 'Update facts, prices and dates, add what newer ranking pages cover, and link to it from related pages.',
        impact: 4, effort: 2,
        success_check: 'Clicks back to the level of the previous 90 days.',
      }),
    });
  }
  for (const q of content?.weak_quality ?? []) {
    out.push({
      earliest: 3,
      task: task({
        title: `Make ${path(q.url)} more original and trustworthy`, urls: [q.url], category: 'content', week: 2,
        why: q.note,
        change: 'Add the business’s own experience: real photos, examples, figures, who wrote it and why they know.',
        impact: 3, effort: 3,
        success_check: 'The next content check scores the page 3 or more on originality, accuracy and experience.',
      }),
    });
  }

  // H. AI visibility.
  if (ai) {
    if (ai.blocked_crawlers.length) {
      out.push({
        earliest: 1,
        task: task({
          title: 'Let AI search crawlers read the site', category: 'ai_visibility', week: 1, impact: 5, confidence: 4, effort: 1,
          why: `robots.txt or the firewall blocks ${ai.blocked_crawlers.join(', ')}, so these assistants cannot show the site.`,
          change: 'Allow these crawlers in robots.txt and the firewall or CDN bot rules.',
          success_check: 'The next AI search check shows every search crawler allowed.', check_after_days: 7,
        }),
      });
    }
    for (const f of ai.wrong_facts) {
      out.push({
        earliest: 1,
        task: task({
          title: 'Correct what AI says about the business', category: 'ai_visibility', week: 2, impact: 4, effort: 2,
          why: f,
          change: 'State the right fact clearly on the About and Contact pages and in the Organization schema, and fix it on the profiles AI reads (Business Profile, directories).',
          success_check: 'ChatGPT gives the right fact in the next AI search check.',
        }),
      });
    }
    for (const s of ai.missing_entity_signals) {
      out.push({
        earliest: 1,
        task: task({
          title: `Help AI recognise the business: ${s.split(':')[0]}`, category: 'ai_visibility', week: 3, impact: 3, effort: 2,
          why: s,
          change: 'Use one business name everywhere, add Organization (or LocalBusiness) schema with logo, contact details and sameAs links to the business’s profiles.',
          success_check: 'The next AI search check shows this signal as present.',
        }),
      });
    }
    for (const p of ai.answer_ready_problems) {
      out.push({
        earliest: 2,
        task: task({
          title: `Make pages answer-ready: ${p.split(':')[0]}`, category: 'ai_visibility', week: 2, impact: 3, effort: 2,
          why: p,
          change: 'Put a short direct answer near the top of the main pages, use question-style H2s, an FAQ section with FAQPage schema, lists and tables.',
          success_check: 'The audit shows this check passing.',
        }),
      });
    }
    for (const d of ai.cited_sources.filter((d) => !d.includes(args.domain)).slice(0, 6)) {
      out.push({
        earliest: 2,
        task: task({
          title: `Get the business mentioned on ${d}`, category: 'ai_visibility', week: 4, impact: 3, effort: 3,
          why: `AI assistants cite ${d} for questions in this niche.`,
          change: `Get listed, reviewed or quoted on ${d} (profile, listing, answer or article), with the business name and website written the same way as on the site.`,
          success_check: 'The business appears on the site and is named in more AI answers at the next check.',
        }),
      });
    }
    for (const q of ai.questions_where_you_are_not_named.slice(0, 8)) {
      out.push({
        earliest: 3,
        task: task({
          title: `Answer “${q}” on the site`, keywords: [q], category: 'ai_visibility', week: 2, impact: 3, effort: 2,
          why: 'AI assistants answer this question without naming the business.',
          change: 'Add a section (or a page) with a direct 40–80 word answer, then detail, proof and the business’s own figures; link to it from related pages.',
          success_check: 'The business is named for this question at a later AI search check.',
        }),
      });
    }
  } else {
    const pages = args.report?.pages ?? [];
    if (pages.length && !pages.some((p) => p.schemaTypes.some((t) => /Organization|LocalBusiness|Store/.test(t)))) {
      out.push({
        earliest: 1,
        task: task({
          title: 'Tell AI who the business is: Organization schema', urls: [pages[0]!.url], category: 'ai_visibility', week: 3, impact: 3, effort: 2,
          why: 'No page has Organization or LocalBusiness schema, so AI assistants have less to recognise the business by.',
          change: 'Add Organization (or LocalBusiness) schema to the homepage with name, logo, contact details and sameAs links to the business’s profiles.',
          success_check: 'Google’s Rich Results Test reads the schema without errors.',
        }),
      });
    }
    for (const q of (args.prompts ?? []).slice(0, 8)) {
      out.push({
        earliest: 3,
        task: task({
          title: `Answer “${q}” on the site`, keywords: [q], category: 'ai_visibility', week: 2,
          why: 'People ask AI assistants this question; a clear answer on the site makes the business easier to recommend.',
          change: 'Add a section (or a page) with a direct 40–80 word answer, then detail, proof and the business’s own figures.',
          success_check: 'The business is named for this question when AI search is checked.',
        }),
      });
    }
  }

  // Audit issues the clean-up does not cover.
  for (const i of args.report?.issues ?? []) {
    if (i.severity === 'info' || (i.status !== 'fail' && i.status !== 'warn') || CLEANUP_RULES.test(i.ruleId)) continue;
    out.push({
      earliest: i.severity === 'critical' || i.severity === 'high' ? 1 : 2,
      task: task({
        title: i.title.client, urls: i.urls.slice(0, 20), category: categoryOf(i.ruleId), week: 2,
        why: i.message.client, change: i.fix.client,
        impact: i.ice.impact, confidence: i.ice.confidence, effort: i.ice.effort,
        success_check: 'The next audit shows this check passing.', check_after_days: 14,
      }),
    });
  }
  return out;
}
