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
  await page.getByRole('link', { name: 'Open the full report' }).click();
  await expect(page).toHaveURL(new RegExp(`/my/reports/${id}$`));
  await expect(page.getByRole('link', { name: 'Download .md' })).toBeVisible();

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
