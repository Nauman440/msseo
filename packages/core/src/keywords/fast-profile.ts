import { pageNameOf } from '../actions/plan-names';
import { titleSuffix } from '../actions/plan-prompt';
import type { ReportModel } from '../types';
import { defaultBannedClaims, type FastBusinessType, type FastProfile, type LivePage } from './fast-filter';
import type { KeywordWorkspace } from './types';

/**
 * Step 1 of the fast keyword pipeline: the business profile, from the website's research inputs, its
 * Yes/No answers and its latest audit (the same for the Keywords tab and autopilot).
 */
export function fastProfileFrom(ws: KeywordWorkspace, ctx: { report?: ReportModel | null; competitors: string[]; rivalNames?: string[]; name?: string | null }): FastProfile {
  const type: FastBusinessType = ws.businessType === 'shop' ? 'ecommerce' : ws.seeds.locations.length ? 'local' : 'b2b';
  const answers = ws.fastAnswers ?? [];
  const pages = ctx.report?.pages ?? [];
  const suffix = titleSuffix(pages);
  // Checked pages answered 200; pages the audit found broken (4xx) are listed so their old addresses can be redirected.
  const live: LivePage[] = pages.map((p) => ({ url: p.url, status: 200, name: pageNameOf(p, suffix) }));
  const broken = (ctx.report?.issues ?? []).filter((i) => i.ruleId === '1.5.1').flatMap((i) => i.urls ?? []);
  for (const u of broken) if (!live.some((x) => x.url === u)) live.push({ url: u, status: 404, name: '' });
  const label = ws.domain.replace(/^www\./, '').split('.')[0] ?? ws.domain;
  const categories = [...ws.seeds.services, ...ws.seeds.extra].map((s) => s.trim()).filter(Boolean);
  const banned = ws.seeds.bannedClaims?.length ? ws.seeds.bannedClaims : defaultBannedClaims(categories);
  return {
    domain: ws.domain,
    name: ctx.name?.trim() || label.charAt(0).toUpperCase() + label.slice(1),
    businessType: type,
    categories,
    brandsStocked: ws.seeds.brands,
    // "Is X your own brand?" Yes → kept as the client's brand; No → never suggested again.
    ownBrands: [...new Set([...(ws.seeds.ownBrands ?? []), label, ...answers.filter((a) => a.answer === 'yes').map((a) => a.keyword)])],
    country: ws.country,
    cities: type === 'local' ? ws.seeds.locations : [],
    language: ws.language,
    notOffered: [...new Set([...(ws.seeds.notOffered ?? []), ...answers.filter((a) => a.answer === 'no').map((a) => a.keyword)])],
    bannedClaims: banned,
    industries: type === 'b2b' ? ws.seeds.locations : [],
    livePages: live.slice(0, 400),
    competitors: ctx.competitors.slice(0, 3),
    rivalNames: ctx.rivalNames ?? [],
  };
}
