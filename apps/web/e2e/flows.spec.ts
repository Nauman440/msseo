import { expect, test } from '@playwright/test';

test('homepage launcher pre-fills the new-audit form', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Website URL').fill('clientsite.com');
  await page.getByRole('group', { name: 'Report for' }).getByText('SEO expert', { exact: true }).click();
  await page.getByRole('button', { name: 'Run audit' }).click();

  await expect(page).toHaveURL(/\/audits\/new\?url=clientsite\.com&audience=expert/);
  await expect(page.getByLabel('Website URL')).toHaveValue('clientsite.com');
  await expect(page.getByRole('radio', { name: /SEO expert report/ })).toBeChecked();
});

test('new-audit form offers five page-limit ranges and an optional report email', async ({ page }) => {
  await page.goto('/audits/new');
  const pageLimit = page.getByLabel('Page limit');
  await expect(pageLimit.locator('option')).toHaveText([
    '1–10 pages',
    '11–20 pages',
    '21–30 pages',
    '31–40 pages',
    '41–50 pages',
  ]);
  await expect(pageLimit).toHaveValue('10');
  await pageLimit.selectOption('30');
  await expect(pageLimit).toHaveValue('30');

  const email = page.getByLabel('Email me the full report');
  await expect(email).toHaveAttribute('type', 'email');
  await expect(email).not.toHaveAttribute('required', '');
});

test('report switches between client and expert modes', async ({ page }) => {
  await page.goto('/audits/demo');
  const switcher = page.getByRole('navigation', { name: 'Report audience' });
  await expect(switcher.getByRole('link', { name: 'Client' })).toHaveAttribute('aria-current', 'page');
  // Client mode hides checklist IDs and expert-only cards.
  await expect(page.getByText('1.3.2', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Redirect chains' })).toHaveCount(0);

  await switcher.getByRole('link', { name: 'SEO expert' }).click();
  await expect(page).toHaveURL(/mode=expert/);
  await expect(page.getByText('1.3.2', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Redirect chains' })).toBeVisible();
});

test('print route lays out A4 pages for PDF', async ({ page }) => {
  await page.goto('/audits/demo/print?mode=client');
  await page.emulateMedia({ media: 'print' });
  const cover = page.locator('.pdf-cover');
  await expect(cover).toBeVisible();
  const box = await cover.boundingBox();
  // 210mm × 297mm at 96 dpi ≈ 794 × 1123 px.
  expect(Math.round(box?.width ?? 0)).toBe(794);
  expect(Math.round(box?.height ?? 0)).toBe(1123);
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeHidden();
});

test('PDF and Markdown downloads are generated on the server', async ({ request }) => {
  const pdf = await request.get('/api/audits/demo/pdf?mode=client');
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  const bytes = await pdf.body();
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  // Cover + at least the summary, issues and checks sections.
  expect((bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThanOrEqual(4);

  const md = await request.get('/api/audits/demo/markdown?mode=expert');
  expect(md.headers()['content-type']).toContain('text/markdown');
  expect(await md.text()).toContain('## Issues to fix');
});

test('unknown audit returns 404', async ({ page }) => {
  const res = await page.goto('/audits/does-not-exist');
  expect(res?.status()).toBe(404);
});
