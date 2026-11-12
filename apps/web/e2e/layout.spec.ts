import { expect, test } from '@playwright/test';

/** Every page must render without errors or sideways scroll on desktop and mobile (§9.5). */
const ROUTES = [
  { path: '/', heading: /holding a site back/i },
  { path: '/audits/demo', heading: 'summitairhvac.com' },
  { path: '/audits/demo?mode=expert', heading: 'summitairhvac.com' },
  { path: '/audits/new', heading: 'Audit a website' },
  { path: '/audits/demo/print', heading: 'Summit Air Heating & Cooling' },
  { path: '/dev/components', heading: 'Components' },
];

for (const route of ROUTES) {
  test(`renders ${route.path}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));

    await page.goto(route.path, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);

    await testInfo.attach(`${testInfo.project.name}${route.path.replace(/[/?=]/g, '_')}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
}

test('interactive elements meet the 40px minimum tap size', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'tap targets matter on touch devices');
  for (const path of ['/', '/audits/demo', '/audits/new']) {
    await page.goto(path);
    const small = await page.$$eval('main button, main [role="button"], main input[type="submit"]', (els) =>
      els
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => ({ text: el.textContent?.trim(), h: el.getBoundingClientRect().height }))
        .filter((b) => b.h < 40),
    );
    expect(small, `small buttons on ${path}`).toEqual([]);
  }
});
