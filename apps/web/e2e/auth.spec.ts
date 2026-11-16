import { expect, test } from '@playwright/test';
import { E2E_PREVIEW_PASSWORD } from '../playwright.config';

// One ordered story against a fresh server with login on (see playwright.config.ts).
test.describe.configure({ mode: 'serial' });

const ADMIN = { name: 'Ada Admin', email: 'ada@example.com', password: 'admin-password-123' };
const MEMBER = { email: 'max@example.com', password: 'member-password-123' };

test('the tool redirects to sign-in, and APIs answer 401', async ({ page, request }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  expect((await request.get('/api/audits/demo/markdown')).status()).toBe(401);
  // The public landing page stays open.
  expect((await request.get('/')).status()).toBe(200);
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

  await page.getByLabel('Email').fill(MEMBER.email);
  await page.getByLabel('Starting password').fill(MEMBER.password);
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByText(`Added ${MEMBER.email}`)).toBeVisible();

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
