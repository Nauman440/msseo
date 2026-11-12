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
  await expect(page.getByRole('button', { name: 'Save as PDF' })).toBeHidden();
});

test('unknown audit returns 404', async ({ page }) => {
  const res = await page.goto('/audits/does-not-exist');
  expect(res?.status()).toBe(404);
});
