import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Throwaway SQLite database for the e2e run. A unique file per run guarantees a
 * clean slate (empty schema + freshly seeded admin) regardless of the state of
 * the developer's `src/server/data/formmaker.sqlite`; the global teardown removes
 * it again. Only used when Playwright starts the API itself — a reused local
 * dev server keeps its own database.
 */
export const E2E_SQLITE_PATH = path.join(
  os.tmpdir(),
  `formmaker-e2e-${process.pid}-${Date.now()}.sqlite`,
);

/** Remove the e2e database and any SQLite WAL/journal siblings. */
export function removeE2eDatabase(): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    rmSync(`${E2E_SQLITE_PATH}${suffix}`, { force: true });
  }
}
