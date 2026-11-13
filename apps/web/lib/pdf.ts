import 'server-only';
import { chromium } from 'playwright';

/**
 * Renders the print route to an A4 PDF on the server, the same way the worker does
 * (apps/worker/src/pdf/render.ts). Downloads no longer depend on the browser's print
 * dialog, whose margin and "background graphics" settings broke the layout.
 */
export async function renderPdf(url: string, headers: Record<string, string>): Promise<Buffer> {
  const browser = await launch();
  try {
    const context = await browser.newContext({ extraHTTPHeaders: headers });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
}

/**
 * PLAYWRIGHT_CHANNEL=chrome uses an installed Chrome. Otherwise Playwright's bundled
 * Chromium (Docker), falling back to installed Chrome when that isn't downloaded (local).
 */
async function launch() {
  const channel = process.env.PLAYWRIGHT_CHANNEL;
  if (channel) return chromium.launch({ channel });
  try {
    return await chromium.launch();
  } catch (err) {
    if (!/Executable doesn't exist/i.test(String(err))) throw err;
    return chromium.launch({ channel: 'chrome' });
  }
}

/** Where the server can reach itself (the public host may be a tunnel or proxy). */
export function internalOrigin(): string {
  return process.env.INTERNAL_APP_URL?.replace(/\/$/, '') || `http://127.0.0.1:${process.env.PORT || 3000}`;
}
