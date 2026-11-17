import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
// A second server with login switched on, used only by e2e/auth.spec.ts.
const AUTH_PORT = PORT + 1;
// Fresh, throwaway data folder per run so the "no accounts yet" setup flow is real.
// Set once in the main process; test workers re-load this file but inherit the variable.
export const AUTH_DATA = (process.env.E2E_AUTH_DATA ??= resolve(tmpdir(), `msscore-e2e-auth-${Date.now()}`));
export const E2E_PREVIEW_PASSWORD = 'e2e-shared-password';
// Test-only key for the auth server (signs the print-page token used for emailed PDFs).
export const E2E_ENCRYPTION_KEY = Buffer.alloc(32, 42).toString('base64');
// Locally, PLAYWRIGHT_CHANNEL=chrome reuses installed Chrome instead of downloading Chromium.
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // One Next server serves every test: more than ~6 browsers at once causes timing flakes
  // (hydration races, Chrome screenshot errors) on many-core machines.
  workers: process.env.CI ? undefined : 6,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', testIgnore: /auth\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, channel } },
    { name: 'mobile', testIgnore: /auth\.spec/, use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 }, channel } },
    // Login flow: one ordered run (it creates the first admin), desktop only.
    { name: 'auth', testMatch: /auth\.spec/, fullyParallel: false, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${AUTH_PORT}`, channel } },
  ],
  // Tests run against the production build so the service worker and PWA paths are real.
  webServer: [
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      env: { SHOW_DEV_PAGES: '1', NEXT_TELEMETRY_DISABLED: '1' },
      timeout: 60_000,
    },
    {
      command: `npx next start -p ${AUTH_PORT}`,
      url: `http://localhost:${AUTH_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        NEXT_TELEMETRY_DISABLED: '1',
        AUTH_SECRET: 'e2e-only-secret-not-used-anywhere-else-0123456789',
        PREVIEW_PASSWORD: E2E_PREVIEW_PASSWORD,
        ENCRYPTION_KEY: E2E_ENCRYPTION_KEY,
        DATA_DIR: AUTH_DATA,
        DATABASE_URL: '',
        REDIS_URL: '',
        // Paid APIs fail fast (closed port): e2e never spends DataForSEO credits.
        DATAFORSEO_BASE_URL: 'http://127.0.0.1:9',
      },
      timeout: 60_000,
    },
  ],
});
