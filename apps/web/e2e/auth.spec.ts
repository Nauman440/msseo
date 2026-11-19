import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { sampleReport } from '@seo/core';
import { signPrintToken } from '@seo/core/print-token';
import { AUTH_DATA, E2E_ENCRYPTION_KEY, E2E_PREVIEW_PASSWORD } from '../playwright.config';

// One ordered story against a fresh server with login on (see playwright.config.ts).
test.describe.configure({ mode: 'serial' });

const ADMIN = { name: 'Ada Admin', email: 'ada@example.com', password: 'admin-password-123' };
const MEMBER = { email: 'max@example.com', password: 'member-password-123' };

test('the tool redirects to sign-in, and APIs answer 401', async ({ page, request }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  expect((await request.get('/api/audits/demo/markdown')).status()).toBe(401);
  // The public landing page and the legal pages (linked from Google's consent screen) stay open.
  for (const path of ['/', '/privacy', '/terms']) expect((await request.get(path)).status(), path).toBe(200);
  expect((await request.get('/api/gsc/connect')).status()).toBe(401);
});

test('first admin is created on /setup behind the shared password', async ({ browser, request }) => {
  // Without the shared password /setup is refused (a plain HTTP request: Chrome turns a
  // credential-less 401 into its own error page).
  expect((await request.get('/setup')).status()).toBe(401);

  const ctx = await browser.newContext({ httpCredentials: { username: 'team', password: E2E_PREVIEW_PASSWORD } });
  const page = await ctx.newPage();
  await page.goto('/setup');
  await page.getByLabel('Your name').fill(ADMIN.name);
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByLabel('Repeat password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Create admin and sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  // Setup is closed once an account exists.
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/login|\/dashboard/);
  await ctx.close();
});

test('wrong password is refused with a neutral message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/do not match an active account/)).toBeVisible();
});

test('admin adds a member, who cannot manage users', async ({ page, browser }) => {
  await page.goto('/login?next=/settings/users');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/settings\/users/);
  // Let the page hydrate first, so the form submits through React and shows its result.
  await page.waitForLoadState('networkidle');

  // A fill can be lost if React finishes hydrating at that moment: retry the whole step
  // (a second try after a successful add shows "already exists", which also means done).
  await expect(async () => {
    await page.getByLabel('Email').fill(MEMBER.email);
    await page.getByLabel('Starting password').fill(MEMBER.password);
    await page.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByText(`Added ${MEMBER.email}`).or(page.getByText(/already/i))).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });

  const member = await (await browser.newContext()).newPage();
  await member.goto('/login');
  await member.getByLabel('Email').fill(MEMBER.email);
  await member.getByLabel('Password').fill(MEMBER.password);
  await member.getByRole('button', { name: 'Sign in' }).click();
  await expect(member).toHaveURL(/\/dashboard/);
  await member.goto('/settings/users');
  await expect(member).toHaveURL(/\/dashboard/);

  // Sign out returns to the login page.
  await member.locator('header summary').click();
  await member.getByRole('button', { name: 'Sign out' }).click();
  await expect(member).toHaveURL(/\/login/);
});

test('a failed audit can be retried in place with the same settings', async ({ page }) => {
  // A failed audit of an address that cannot exist: the retry fails again at the first
  // DNS lookup, so no paid API is called (or, without DataForSEO keys, it reports that).
  const id = 'e2e-failed-audit';
  const steps = ['preflight', 'crawl', 'fetch', 'lighthouse', 'gsc', 'report', 'ai'].map((s) => ({ id: s, label: s, state: s === 'preflight' ? 'failed' : 'queued' }));
  const record = {
    id,
    input: { url: 'https://msscore-e2e.invalid/', audience: 'client', pageLimit: 10, auditMode: 'quick', jsRendering: false, aiRecommendations: false, gscProperty: null, gscRangeDays: 90 },
    status: 'failed', progress: 5, steps, error: 'Old failure', createdAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:10.000Z',
  };
  await mkdir(resolve(AUTH_DATA, 'audits'), { recursive: true });
  await writeFile(resolve(AUTH_DATA, 'audits', `${id}.json`), JSON.stringify(record));

  await page.goto(`/login?next=/audits/${id}`);
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Old failure')).toBeVisible();
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Retry with the same settings' }).click();
  // Same audit page, a fresh run, which ends in a new (real) failure message.
  await expect(page).toHaveURL(new RegExp(`/audits/${id}`));
  const noKeys = page.getByText(/DataForSEO login and password are missing/);
  await expect
    .poll(async () => (await noKeys.count()) > 0 || (await page.getByText('Old failure').count()) === 0, { timeout: 30_000 })
    .toBe(true);
  if (await noKeys.count()) return; // CI without provider keys: the action explains why it cannot run.
  await expect(page.getByRole('button', { name: 'Retry with the same settings' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/does not exist|could not|did not respond/i)).toBeVisible();
});

test('a signed print link opens one report for the PDF email, and nothing else', async ({ request }) => {
  const opts = { maxRedirects: 0 };
  expect((await request.get('/audits/demo/print', opts)).status()).toBe(307); // login required
  const token = await signPrintToken('demo', E2E_ENCRYPTION_KEY);
  expect((await request.get(`/audits/demo/print?pdf_token=${encodeURIComponent(token)}`, opts)).status()).toBe(200);
  expect((await request.get(`/audits/demo/print?pdf_token=${encodeURIComponent(`${token}x`)}`, opts)).status()).toBe(401);
  // The token is bound to its audit and to the print page.
  expect((await request.get(`/audits/other/print?pdf_token=${encodeURIComponent(token)}`, opts)).status()).toBe(401);
  expect((await request.get(`/audits/demo?pdf_token=${encodeURIComponent(token)}`, opts)).status()).toBe(307);
});

test('the free report is public, offers the trial, and team audits stay private', async ({ page, request }) => {
  const id = '00000000-0000-4000-8000-00000000f4ee';
  const report = { ...sampleReport, auditId: id };
  const record = {
    id,
    input: { url: 'https://www.summitairhvac.com/', audience: 'client', pageLimit: 10, auditMode: 'quick', jsRendering: false, aiRecommendations: false, gscProperty: null, gscRangeDays: 90, source: 'public' },
    status: 'completed', progress: 100, steps: [], report, createdAt: '2026-11-16T00:00:00.000Z', finishedAt: '2026-11-16T00:01:00.000Z',
  };
  await mkdir(resolve(AUTH_DATA, 'audits'), { recursive: true });
  await writeFile(resolve(AUTH_DATA, 'audits', `${id}.json`), JSON.stringify(record));

  await page.goto(`/free/${id}`);
  await expect(page.getByRole('heading', { name: 'summitairhvac.com', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start 7-day free trial' }).first()).toHaveAttribute('href', `/signup?audit=${id}`);
  // Expert-only content and team actions are not part of the free report.
  await expect(page.getByText('1.3.2', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download .md' })).toHaveCount(0);

  // The same audit is not reachable through the team routes without a login, and a team audit is not public.
  expect((await request.get(`/api/audits/${id}/status`)).status()).toBe(401);
  expect((await request.get('/free/e2e-failed-audit')).status()).toBe(404);
  expect((await request.get('/api/free/e2e-failed-audit/status')).status()).toBe(404);
});

test('a visitor signs up from the free report and lands on their own dashboard', async ({ page, request }) => {
  const id = '00000000-0000-4000-8000-00000000f4ee'; // the free audit seeded in the previous test
  await page.goto(`/free/${id}`);
  await page.getByRole('link', { name: 'Start 7-day free trial' }).first().click();

  // Choose a plan, then step 1 · About you.
  await expect(page.getByRole('heading', { name: 'Choose your plan' })).toBeVisible();
  await page.getByRole('link', { name: 'Start 7-day free trial' }).nth(1).click(); // Growth
  await expect(page).toHaveURL(/\/signup\/account\?plan=growth&audit=/);
  await expect(page.getByText('Your free audit for')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Your name').fill('Ghazanfar Ali');
  await page.getByLabel('Business name').fill('Summit Air');
  await page.getByLabel('Email').fill('owner@summitair.example');
  await page.getByLabel('Phone').fill('+1 214 555 0100');
  await page.getByLabel('Password').fill('summit-air-2026');
  await page.getByRole('button', { name: 'Create my account' }).click();

  // Step 2 · the website from the free audit is pre-filled.
  await expect(page).toHaveURL(/\/signup\/website$/);
  await expect(page.getByRole('heading', { name: 'Hi Ghazanfar, is this your website?' })).toBeVisible();
  await expect(page.getByLabel('Website address')).toHaveValue('https://summitairhvac.com/');
  await expect(page.getByText(/Your free audit found \d+ issues?/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3 · area.
  await expect(page).toHaveURL(/\/signup\/area$/);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Country').fill('United States');
  const areas = page.getByLabel('Cities and areas you serve', { exact: true });
  await areas.fill('Dallas');
  await areas.press('Enter');
  await areas.fill('Plano');
  await areas.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove Plano' })).toBeVisible();
  await page.getByText('English', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 4 · services and competitors.
  await expect(page).toHaveURL(/\/signup\/services$/);
  await page.waitForLoadState('networkidle');
  const services = page.getByLabel('Your services', { exact: true });
  await services.fill('AC repair');
  await services.press('Enter');
  await page.getByLabel(/Competitors you know about/).fill('rival-hvac.com');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 5 · connect and approve.
  await expect(page).toHaveURL(/\/signup\/connect$/);
  await page.getByText('Search Console', { exact: true }).click();
  await page.getByText('I allow MSScore to prepare changes to my website').click();
  await page.getByRole('button', { name: 'Finish setup' }).click();

  // The customer dashboard: their site, the free audit's score, and its report.
  await expect(page).toHaveURL(/\/my\?welcome=1$/);
  await expect(page.getByRole('heading', { name: /You are all set, Ghazanfar/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'summitairhvac.com', level: 1 })).toBeVisible();
  await expect(page.getByText(/Free trial: \d+ days? left/)).toBeVisible();
  // Before Google is connected: the connect card, locked tabs, and the audit that is available now.
  await expect(page.getByRole('heading', { name: 'Connect Google to unlock your dashboard' })).toBeVisible();
  await expect(page.getByText('Connecting Google is not switched on yet', { exact: false }).first()).toBeVisible(); // no Google client in e2e
  await expect(page.getByRole('navigation', { name: 'Site sections' }).getByRole('link', { name: /Weekly plan/ })).toHaveAttribute('href', /\/my\/connections\?site=summitairhvac\.com/);
  await page.getByRole('link', { name: /See all \d+ issues/ }).click();
  await expect(page).toHaveURL(new RegExp(`/my/reports/${id}$`));
  await expect(page.getByRole('link', { name: 'Download .md' })).toBeVisible();
  // Locked tabs lead to Connections; the Google sign-in says it is not available on this server.
  await page.goto('/my/plan');
  await expect(page).toHaveURL(/\/my\/connections\?site=summitairhvac\.com$/);
  await page.goto('/api/google/connect?site=summitairhvac.com');
  await expect(page).toHaveURL(/\/my\/connections\?site=summitairhvac\.com&error=/);
  await expect(page.getByRole('alert').filter({ hasText: 'Connecting Google is not available yet' })).toBeVisible();

  // Signed in: the landing page's top bar links to the dashboard instead of Log in / Sign up.
  await page.goto('/');
  const account = page.getByRole('navigation', { name: 'Account' });
  await expect(account.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/my');
  await expect(account.getByRole('link', { name: 'Sign up' })).toHaveCount(0);
  await expect(account.getByRole('link', { name: 'Log in' })).toHaveCount(0);
  await page.goto('/my/connections?site=summitairhvac.com');

  // Spec §16.5: the website connection (WordPress / Shopify). Shopify has no app in e2e; WordPress
  // refuses another site's address, and http servers (WordPress only returns approvals to https).
  await expect(page.getByRole('heading', { name: 'Your website', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect Shopify' })).toBeDisabled();
  await page.goto('/api/connections/wordpress/start?domain=summitairhvac.com&site=https://other-site.com');
  await expect(page.getByRole('alert').filter({ hasText: 'Connect the WordPress site at summitairhvac.com, not other-site.com' })).toBeVisible();
  await page.getByRole('button', { name: 'Connect WordPress' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'WordPress only sends approvals back to https addresses' })).toBeVisible();
  const plugin = await page.request.get('/downloads/msscore-connector.zip');
  expect(plugin.status()).toBe(200);
  expect((await plugin.body()).subarray(0, 2).toString()).toBe('PK');

  // Growth covers up to 3 websites: add one (an address that cannot exist, so its audit stops at DNS), switch, remove.
  await page.goto('/my/sites');
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/Add a website/).fill('https://second-site.invalid/');
  await page.getByRole('button', { name: 'Add website' }).click();
  await expect(page).toHaveURL(/\/my\?site=second-site\.invalid$/);
  await expect(page.getByRole('heading', { name: 'second-site.invalid', level: 1 })).toBeVisible();
  await page.goto('/my/sites');
  await expect(page.getByRole('navigation', { name: 'Your websites' }).getByRole('link')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove second-site.invalid' }).click();
  await expect(page).toHaveURL(/\/my\/sites$/);
  await expect(page.getByRole('navigation', { name: 'Your websites' }).getByRole('link')).toHaveCount(1);

  // Module 3 for customers: searches come from onboarding; add, shortlist, persist.
  await page.goto('/my');
  await page.getByRole('navigation', { name: 'Site sections' }).getByRole('link', { name: 'Competitors' }).click();
  const compSections = page.getByRole('navigation', { name: 'Competitor sections' });
  await expect(page.getByRole('heading', { name: 'Your shortlist' })).toBeVisible();
  await compSections.getByRole('link', { name: 'Where to look' }).click();
  await expect(page.getByRole('button', { name: 'Remove ac repair dallas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove ac repair plano' })).toBeVisible();
  await compSections.getByRole('link', { name: /^Competitors/ }).click();
  await expect(page.getByText('No competitors yet.')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Website', { exact: true }).fill('https://www.rival-hvac.com/');
  await page.getByRole('button', { name: 'Add competitor' }).click();
  await expect(page.getByText('rival-hvac.com added.')).toBeVisible();
  // Added as direct: on the shortlist and pressed in the table.
  await expect(page.getByRole('button', { name: 'Remove rival-hvac.com from shortlist' })).toBeVisible();
  await expect(page.getByText('1 of 5 to 8')).toBeVisible();
  const choice = page.getByRole('group', { name: 'Shortlist rival-hvac.com' });
  await expect(choice.getByRole('button', { name: 'Direct' })).toHaveAttribute('aria-pressed', 'true');
  await choice.getByRole('button', { name: 'Aspirational' }).click();
  await expect(page.getByText('1 of 2 to 3')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('group', { name: 'Shortlist rival-hvac.com' }).getByRole('button', { name: 'Aspirational' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'You vs your shortlist' })).toBeVisible();
  await compSections.getByRole('link', { name: /^Listings and links/ }).click();
  await expect(page.getByRole('heading', { name: 'Listings and link targets' })).toBeVisible();
  // Module 6: the analysis compares the shortlist (not run in e2e: it would fetch real sites).
  await compSections.getByRole('link', { name: 'Analysis' }).click();
  await expect(page.getByText('Compares you with 1 shortlisted competitor: rival-hvac.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run the analysis' })).toBeVisible();
  expect((await page.request.get('/api/analysis/summitairhvac.com/csv')).status()).toBe(404);
  expect((await page.request.get('/api/analysis/rival-hvac.com/csv')).status()).toBe(404);
  // The team's competitor pages are not for customers.
  await page.goto('/competitors/rival-hvac.com');
  await expect(page).toHaveURL(/\/my$/);

  // Module 4 for customers: seeds come from onboarding; add keywords, remove one, export CSV.
  await page.getByRole('navigation', { name: 'Site sections' }).getByRole('link', { name: 'Keywords' }).click();
  const sections = page.getByRole('navigation', { name: 'Keyword sections' });
  await expect(sections.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('No keywords yet.')).toBeVisible();
  await sections.getByRole('link', { name: 'Research inputs' }).click();
  await expect(page.getByRole('heading', { name: 'What you offer and where' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove AC repair', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Plano' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Product shop mode: product wording, no places; then back to services.
  await page.getByText('An online shop').click();
  await expect(page.getByLabel('Products and categories', { exact: true })).toBeVisible();
  await expect(page.getByText('Places you serve')).toBeHidden();
  await page.getByText('Visits, repairs or bookings in an area').click();
  await expect(page.getByText('Places you serve')).toBeVisible();
  await sections.getByRole('link', { name: /^All keywords/ }).click();
  await expect(page.getByRole('heading', { name: 'Add keywords you know' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Keywords', { exact: true }).fill('ac repair plano\nEmergency AC repair, ac repair plano');
  await page.getByRole('button', { name: 'Add keywords' }).click();
  await expect(page.getByText('2 keywords added.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove emergency ac repair' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove emergency ac repair' }).click();
  await expect(page.getByText('1 keyword', { exact: true })).toBeVisible();
  await page.getByLabel('Show').selectOption('removed');
  await expect(page.getByRole('button', { name: 'Keep emergency ac repair' })).toBeVisible();
  await expect(page.getByText('Removed by hand')).toBeVisible();
  const csv = await page.request.get('/api/keywords/summitairhvac.com/csv');
  expect(csv.headers()['content-type']).toContain('text/csv');
  expect(await csv.text()).toContain('emergency ac repair,removed,Removed by hand');
  // Questions for AI: add one by hand, then choose which ones are tracked.
  await sections.getByRole('link', { name: /^Questions for AI/ }).click();
  await expect(page.getByRole('heading', { name: 'Questions people ask AI assistants' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Add a question your customers ask').fill('Who can fix my AC today in Plano?');
  await page.getByRole('button', { name: 'Add question' }).click();
  await expect(page.getByText('Question added.')).toBeVisible();
  await page.getByLabel('Track: Who can fix my AC today in Plano?').uncheck();
  await page.getByRole('button', { name: 'Track 0 questions' }).click();
  await expect(page.getByText('0 questions tracked.')).toBeVisible();
  // Other sites' keywords stay private.
  expect((await page.request.get('/api/keywords/rival-hvac.com/csv')).status()).toBe(404);
  await page.goto('/keywords/summitairhvac.com');
  await expect(page).toHaveURL(/\/my$/);

  // Module 5 for customers: Keywords → Page mapping needs keyword topics first (none researched in e2e).
  await page.getByRole('navigation', { name: 'Site sections' }).getByRole('link', { name: 'Keywords' }).click();
  await page.getByRole('navigation', { name: 'Keyword sections' }).getByRole('link', { name: /^Page mapping/ }).click();
  await expect(page.getByRole('heading', { name: 'Which page should rank for each topic', level: 2 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Match pages to topics' }).click();
  await expect(page.getByText('Research keywords first', { exact: false })).toBeVisible();
  // The old page plan address leads to the new tab.
  await page.goto('/my/pages');
  await expect(page).toHaveURL(/\/my\/keywords\?view=mapping$/);
  expect((await page.request.get('/api/mapping/rival-hvac.com/brief?topic=x')).status()).toBe(404);
  expect((await page.request.get('/api/mapping/rival-hvac.com/csv')).status()).toBe(404);
  await page.goto('/mapping/summitairhvac.com');
  await expect(page).toHaveURL(/\/my$/);

  // Module 12 for customers: the audit's findings become an action plan with a roadmap.
  await page.getByRole('navigation', { name: 'Site sections' }).getByRole('link', { name: 'Action plan' }).click();
  await expect(page.getByRole('heading', { name: 'Your action plan', level: 2 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /Create actions from the top \d+ issues/ }).click();
  await expect(page.getByRole('heading', { name: 'Top 10 to do now' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '30/60/90-day roadmap' })).toBeVisible();
  await page.locator('select[name="status"]').first().selectOption('done');
  await expect(page.getByText('Marked done. We will check the results after 7, 14 and 28 days.')).toBeVisible();
  const plan = await page.request.get('/api/action-plan/summitairhvac.com/csv');
  expect(plan.headers()['content-type']).toContain('text/csv');
  expect(await plan.text()).toContain('priority,title,severity');
  expect((await page.request.get('/api/action-plan/rival-hvac.com/csv')).status()).toBe(404);
  await page.goto('/my/approvals');
  await expect(page.getByRole('heading', { name: 'Nothing to approve' })).toBeVisible();
  await page.goto('/action-plan/summitairhvac.com');
  await expect(page).toHaveURL(/\/my$/);
  await page.goto('/my/actions');

  // Account settings from the site tabs: plan, details and password.
  await page.getByRole('navigation', { name: 'Site sections' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Account settings', level: 1 })).toBeVisible();
  await expect(page.getByText(/^Free trial · ends /)).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Phone').fill('+1 214 555 0100');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByText('Your details have been saved.')).toBeVisible();
  await page.getByLabel('Current password').fill('not-my-password');
  await page.getByLabel('New password', { exact: true }).fill('summit-air-2027');
  await page.getByLabel('Repeat new password').fill('summit-air-2027');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Your current password is not right.')).toBeVisible();
  // The form clears after each try (React form actions), so every field is filled again.
  await page.getByLabel('Current password').fill('summit-air-2026');
  await page.getByLabel('New password', { exact: true }).fill('summit-air-2027');
  await page.getByLabel('Repeat new password').fill('summit-air-2027');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Your password has been changed.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Phone')).toHaveValue('+1 214 555 0100');

  // Self-service plan: switch down and back, cancel (dashboard says so), restart.
  await page.locator('label').filter({ hasText: 'Autopilot' }).click();
  await page.getByRole('button', { name: 'Change plan' }).click();
  await expect(page.getByText('You are now on Autopilot.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Autopilot · $79/month')).toBeVisible();
  await page.locator('label').filter({ hasText: 'Growth' }).click();
  await page.getByRole('button', { name: 'Change plan' }).click();
  await expect(page.getByText(/You are now on Growth/)).toBeVisible();
  await page.getByText('Cancel your plan').click();
  await page.getByLabel(/Why are you leaving/).fill('Testing');
  await page.getByLabel(/I understand weekly checks/).check();
  await page.getByRole('button', { name: 'Cancel my plan' }).click();
  // The page switches to the cancelled state.
  await expect(page.getByText('Weekly checks and new audits are paused. Your reports are still here.')).toBeVisible();
  await page.goto('/my');
  await expect(page.getByText(/Your plan is cancelled: weekly checks/)).toBeVisible();
  await page.getByRole('link', { name: 'Restart it in your account' }).click();
  await page.getByRole('button', { name: 'Restart my plan' }).click();
  await expect(page.getByText(/^Free trial · ends /)).toBeVisible();
  await page.goto('/my');

  // Customers stay in their own area and cannot open other sites' audits.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/my$/);
  expect((await page.request.get('/api/audits/e2e-failed-audit/status')).status()).toBe(404);
  expect((await page.request.get(`/api/audits/${id}/status`)).status()).toBe(200);
  expect((await request.get('/my')).url()).toMatch(/\/login/); // a visitor without the session
});

test('the team sees the new customer with their onboarding answers', async ({ page }) => {
  await page.goto('/login?next=/settings/customers');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/settings\/customers/);
  await expect(page.getByRole('heading', { name: 'Summit Air' })).toBeVisible();
  await expect(page.getByText('Dallas, Plano', { exact: false })).toBeVisible();
  await expect(page.getByText('AC repair')).toBeVisible();
  await expect(page.getByText('Allowed to prepare changes', { exact: false })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Mark active' }).click();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  // Customers are not team members.
  await page.goto('/settings/users');
  await expect(page.getByText('owner@summitair.example')).toHaveCount(0);
});

test('password reset: the login page links to it and a bad link is refused', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  await page.goto('/reset-password?token=bm90LWEtdXNlcg.9999999999.forged');
  await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
});
