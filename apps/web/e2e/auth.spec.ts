import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { AUTH_DATA, E2E_PREVIEW_PASSWORD } from '../playwright.config';

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
