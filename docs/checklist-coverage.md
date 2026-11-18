# SEO Coverage Checklist vs MS SCORE

Compares every subpoint of the **SEO Coverage Checklist** (`docs/seo-coverage-checklist.pdf`) with what MS SCORE does today. Update this file whenever a module or gap is finished.

Last checked: **18 Nov 2026** against the code on `dev` (after the checklist gap work; see the decisions row of that date in CLAUDE.md).

**Status:** **Done** = automated in the tool · **Partial** = part of the point is covered (what is missing is named) · **Not yet** = not built · **Later** = planned in a later module.

## Summary

| # | Module | Status | Points done |
| --- | --- | --- | --- |
| 1 | Site audit: technical SEO | Done | 70 of 71 points (1.5.7 partial until backlinks); monitoring in "Automate" is Module 13 |
| 2 | Site audit: on-page SEO | Done | 50 of 50 points; alt-text drafts (Automate line) not yet |
| 3 | Competitor identification | Done, 1 partial | 8 of 9 (referring domains wait for Module 8) |
| 4 | Keyword research | Done, 2 partial | 36 of 38 |
| 5 | Keyword to page mapping | Done | 13 of 13 |
| 6 | Deep competitor analysis | Done except later modules | 24 done, 7 partial (4 of them wait for Module 9), 7 wait for backlinks (of 38) |
| 7 | Content audit and gap analysis | Not yet | — |
| 8 | Backlink audit | Not yet | — |
| 9 | Local SEO audit | Not yet (pieces exist) | — |
| 10 | AEO / AI search audit | Not yet (pieces exist) | — |
| 11 | Tracking and conversion audit | Not yet (pieces exist) | — |
| 12 | Prioritisation and action plan | Done | 7 of 7 |
| 13 | Reporting and monitoring setup | Not yet (pieces exist) | — |

**What is left in finished modules:** only points that need a later module (backlinks → Module 8; reviews growth, listing consistency and the map grid → Module 9; weekly AI tracking → Module 10), plus six partial points named below (1.5.7, 4.2.6, 6.1.5, 6.2.4, 6.3.4, 6.5.1).

---

## Module 1 · Technical SEO — Done

Every subpoint 1.1.1–1.13.3 is an automatic rule in the audit (`packages/core/src/audit/rules-*.ts`), with these notes:

| Point | Status | Note |
| --- | --- | --- |
| 1.3.3, 1.3.4, 1.3.5 (indexed part), 1.4.1 (submitted part) | Done | Need a Search Console property on the audit; hidden otherwise |
| 1.3.6 Manual actions and security issues | Done (manual) | Not in Google's API: shown as a manual check with a link, Expert mode |
| 1.5.7 Old URLs with backlinks now 404 | Partial | 404s that still get internal links; the backlink half waits for Module 8 |
| 1.9.5 Popups and interstitials | Done (AI) | AI check of the PageSpeed mobile screenshot; manual item when AI is off |
| 1.13.1, 1.13.2 International | Done | Only on sites with hreflang |
| 1.13.3 RTL and translation quality | Done | x-default, html lang vs hreflang, text not in the labelled language (detected from common words and scripts: en, es, fr, de, it, pt, nl, Arabic, Hebrew, Cyrillic, Chinese, Japanese), and `dir="rtl"` on right-to-left pages; the quality of a translation itself is not judged |

**Automate line:** weekly re-audit (customers) and "changes since the last audit" are **Done**; new-error alerts by email, daily uptime, SSL, robots.txt and noindex monitoring are **Later** (Module 13); "ticket creation" is the action plan (Module 12).

## Module 2 · On-page SEO — Done

Every subpoint 2.1.1–2.9.5 is a rule. Judgement points use AI on key pages (2.1.6, 2.1.7, 2.2.3, 2.3.4, 2.4.2, 2.4.4, 2.4.5, 2.5.4, 2.7.5, 2.8.1 quality). 2.9.x need Search Console. 2.1.4, 2.2.4, 2.3.2, 2.4.3 use the page's mapped keyword from Module 5.

| Point | Status | Note |
| --- | --- | --- |
| 2.4.1 Depth vs top-ranking pages | Done | Mapped pages are compared with the pages Google ranks for their keyword (Module 5 + cached results from keyword research, up to 5 pages × 3 results, own fetch); other pages with their page-type median |
| 2.5.4 Real photos | Done (AI) | Screenshot of the homepage only |

**Automate line:** missing/duplicate titles and meta, heading checks, thin pages, quick wins: **Done**. Alt-text drafts: **Not yet**. Content decay alerts: rule 2.9.5 is **Done**, the alert email is **Later** (Module 13).

## Module 3 · Competitor identification

| Point | Status | Note |
| --- | --- | --- |
| 3.1 Client's own list | Done | Onboarding answers + "Add a competitor you know" |
| 3.2 Labs competitors | Done | |
| 3.3 Live results, 10–15 searches | Done | Up to 15 searches |
| 3.4 Local pack | Done | Map pack in every search, with ratings |
| 3.5 Split by type | Done | Direct / search / local / directory / publisher, manual override |
| 3.6 Shortlist 5–8 + 2–3 | Done | Warnings outside the range; autopilot shortlists for customers |
| 3.7 Directories and publishers saved | Done | "Listings and links" tab with status |
| 3.8 Strength snapshot | Partial | Traffic, keywords, 12-month trend done; **referring domains wait for Module 8** |
| 3.9 Quarterly refresh | Done | Quarterly job + monthly autopilot, new-competitor email |

## Module 4 · Keyword research

| Point | Status | Note |
| --- | --- | --- |
| 4.1.1–4.1.7, 4.1.9 Seeds | Done | Services × places, brands, symptoms, emergency, cost, "best", free text |
| 4.1.8 Question keywords | Done | Questions from suggestions, autocomplete and "People also ask" |
| 4.2.1 Client's rankings (Labs + GSC) | Done | |
| 4.2.2, 4.2.3 Competitor rankings, keyword gap | Done | Domain intersection with up to 3 competitors |
| 4.2.4 Suggestions, ideas | Done | |
| 4.2.5 PAA and autocomplete | Done | |
| 4.2.6 Keywords from competitor top pages | Partial | Covered through their ranked keywords and the gap, not page by page |
| 4.3.1–4.3.7 Metrics | Done | Volume, trend, difficulty, CPC, intent, SERP features, position + URL |
| 4.4.1–4.4.4 Cleaning | Done | |
| 4.5.1–4.5.4 Clustering, one cluster = one page, intent, SERP check | Done | One page per topic is enforced in Module 5 |
| 4.6.1–4.6.5 Prioritisation | Done | Value and chance editable with the client |
| 4.7.1, 4.7.2 30–50 AI questions, grouped | Done | |
| 4.7.3 Saved for weekly tracking | Partial | Saved and ticked; the weekly runs come with Module 10 |

## Module 5 · Keyword to page mapping — Done

All 13 points, in Keywords → Page mapping (decisions row 2026-11-18). Automate line: auto-fill from crawl and keywords, AI title/meta drafts and page briefs: **Done**.

## Module 6 · Deep competitor analysis — Done except later modules

| Point | Status | Note |
| --- | --- | --- |
| 6.1.1 Traffic + 12-month trend | Done | Visits estimate, and up/down over 12 months for shortlisted competitors |
| 6.1.2 Keyword count, top 3, top 10 | Done | |
| 6.1.3 Top pages and their keywords | Done | Each competitor's 5 strongest pages with the searches they rank for (Labs ranked keywords) |
| 6.1.4 Keywords where they beat the client | Done | Keyword gap top 50 |
| 6.1.5 Keywords where the client beats them | Partial | Searches you rank for and your 3 direct competitors do not (Labs domain intersection); searches where both rank and you are higher are not counted |
| 6.2.1 Page type and format | Done | |
| 6.2.2 Title, H1, headings | Done | |
| 6.2.3 Word count and depth | Done | |
| 6.2.4 Topics and entities missing | Partial | Sections the ranking pages have that your page does not cover; named entities (brands, certifications) are not compared separately |
| 6.2.5 FAQs, tables, images, video | Done | |
| 6.2.6 Trust signals and pricing | Done | Reviews, licences/guarantees, prices shown |
| 6.2.7 Calls to action and forms | Done | Forms and call buttons |
| 6.2.8 Schema types | Done | |
| 6.2.9 Freshness | Done | dateModified/datePublished, else the latest year in the text |
| 6.3.1 Speed and Core Web Vitals | Done | Mobile score plus lab LCP, CLS and blocking time per homepage |
| 6.3.2 CMS, builder, CDN | Done | Platform and builder from the page, CDN and server from the response |
| 6.3.3 URL and structure patterns | Done | Biggest sitemap sections per site |
| 6.3.4 Indexed page count and types | Partial | Pages in the sitemap and its sections; Google's indexed count is not available for other sites |
| 6.3.5 Mobile experience | Done | Viewport and zoom, plus the mobile speed score |
| 6.4.1–6.4.6 Backlinks | Later | Module 8 (your decision) |
| 6.5.1 Profile categories, services, photos, posts | Partial | Category, photos, claimed; services and posts come with Module 9 |
| 6.5.2 Reviews: count, rating, growth, responses | Partial | Count and rating; growth and replies come with Module 9 |
| 6.5.3 Listing consistency | Partial | Listing status set by hand (Module 3); checking details is Module 9 |
| 6.5.4 Map pack position | Partial | Core searches from one location; the grid is Module 9 |
| 6.6.1 Prompts: mentions and citations | Done | ChatGPT only (your decision) |
| 6.6.2 Sources AI cites | Done | |
| 6.6.3 Answer formats AI prefers | Done | Steps, lists, tables, sections, short answers |
| 6.7.1 Keyword gap top 50 | Done | |
| 6.7.2 Content gap | Done | With the missing sections per topic |
| 6.7.3 Link gap top 30 | Later | Module 8 |
| 6.7.4 Technical comparison table | Done | Side by side |
| 6.7.5 Local and AI visibility comparison | Done | |
| 6.7.6 Five recommendations | Done | |

**Automate line:** monthly runs for customers under the cap: **Done**. New page / new link alerts and automatic gap refresh: **Later** (Modules 8 and 13).

## Module 12 · Prioritisation and action plan

| Point | Status | Note |
| --- | --- | --- |
| 12.1 Impact × confidence ÷ effort | Done | |
| 12.2 Grouped Critical/High/Medium/Low | Done | "All actions" is grouped by severity, highest priority first in each group |
| 12.3 Top 10 in plain language | Done | |
| 12.4 Owner, due date, approval | Done | |
| 12.5 Before-state | Done | Plus exact before/after changes from the page map |
| 12.6 Verification 7/14/28 days with control pages | Done | |
| 12.7 30/60/90 roadmap | Done | In the plan, reports and PDF |

## Modules 7–11 and 13 — not built yet

Pieces that already exist and will be reused:

- **7 Content audit:** page inventory with Search Console queries (5.1), decay rule 2.9.5, thin and duplicate rules, content gap from 6, page briefs from 5.
- **8 Backlinks:** nothing yet (also completes 1.5.7, 3.8 and 6.4).
- **9 Local SEO:** map ratings and reviews (3, 6.5), local schema rules (1.11), duplicate location pages (2.9.2), NAP check on the site (1.11.4).
- **10 AEO:** AI crawler access (1.2.4), answer-ready content rules (2.8), tracked AI questions (4.7), ChatGPT runs (6.6).
- **11 Tracking:** Search Console + GA4 connection for customers, key events count, click-to-call and form checks (2.7.6).
- **13 Reporting:** weekly re-audit, PDF and .md reports, score trend and "changes since last audit", customer dashboard.

**Built 2026-11-18:** WordPress and Shopify connection (spec §16.5): approved fixes from Modules 5 and 12 can be applied to the site and undone. **Next:** Modules 8 + 9.
