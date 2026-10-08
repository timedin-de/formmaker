import { defineConfig, devices } from '@playwright/test';
import { E2E_SQLITE_PATH } from './e2e/db';

const PORT = 4300;
const API_PORT = 4000;

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Retries only collect traces in CI; a test that needed one must still fail the run.
  failOnFlakyTests: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    locale: 'en-US',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'npm run start:api',
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 60_000,
      env: {
        DATABASE_PROVIDER: 'sqlite',
        SQLITE_PATH: E2E_SQLITE_PATH,
        RATELIMIT: '10000',
        FORMMAKER_PASSWORD: 'formmaker',
        PORT: `${API_PORT}`,
      },
    },
    {
      command: `npm run start:frontend -- --port ${PORT}`,
      url: `http://localhost:${PORT}`,
      timeout: 180_000,
      env: {
        API_URL: `http://localhost:${API_PORT}/`,
      },
    },
  ],
});
