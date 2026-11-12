import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderReportPdf } from './render';

/**
 * Renders the demo report to PDF for design review.
 * Usage: APP_URL=http://localhost:3000 pnpm --filter @seo/worker pdf:sample
 */
const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
const outDir = resolve(process.cwd(), '../../output');
mkdirSync(outDir, { recursive: true });

for (const mode of ['client', 'expert'] as const) {
  const outPath = resolve(outDir, `sample-report-${mode}.pdf`);
  await renderReportPdf({ url: `${appUrl}/audits/demo/print?mode=${mode}`, outPath });
  process.stdout.write(`wrote ${outPath}\n`);
}
