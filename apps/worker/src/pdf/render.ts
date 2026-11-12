import { chromium } from 'playwright';

export type RenderPdfOptions = {
  /** Absolute URL of the /audits/[id]/print route. */
  url: string;
  /** Where to write the PDF. */
  outPath: string;
  /** Session cookie forwarded so the print route passes auth. */
  cookie?: { name: string; value: string; domain: string };
};

/**
 * Pipeline step 14 (`pdf`): render the print route to an A4 PDF.
 * Page size, margins and page breaks are owned by the print CSS (@page), so
 * the PDF matches what the team sees when previewing the print route.
 */
export async function renderReportPdf({ url, outPath, cookie }: RenderPdfOptions): Promise<void> {
  // PLAYWRIGHT_CHANNEL=chrome reuses an installed Chrome (local previews); Docker uses bundled Chromium.
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  try {
    const context = await browser.newContext();
    if (cookie) await context.addCookies([{ ...cookie, path: '/' }]);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: outPath, preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
}
