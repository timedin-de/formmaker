import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';

export { expect };
export type { Page };

/**
 * Playwright has no built-in coverage. This auto fixture captures V8 JS
 * coverage (Chromium only) for the whole page session and stashes the raw
 * per-test entries in `coverage/e2e/raw/`; the global teardown converts them
 * into an Istanbul/lcov report. Firefox/WebKit simply skip collection.
 */
export const test = base.extend<{ _v8Coverage: void }>({
  _v8Coverage: [
    async ({ page, browserName }, use, testInfo) => {
      if (browserName !== 'chromium') {
        await use();
        return;
      }
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();
      const entries = await page.coverage.stopJSCoverage();
      const dir = path.join(process.cwd(), 'coverage/e2e/raw');
      mkdirSync(dir, { recursive: true });
      const file = `${testInfo.project.name}-${testInfo.testId.slice(-8)}.json`;
      writeFileSync(path.join(dir, file), JSON.stringify(entries));
    },
    { auto: true },
  ],
});
