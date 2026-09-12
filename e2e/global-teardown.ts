import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import v8toIstanbul from 'v8-to-istanbul';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';

interface V8Range {
  startOffset: number;
  endOffset: number;
  count: number;
}

interface V8Function {
  functionName?: string;
  ranges: V8Range[];
}

interface V8Entry {
  url: string;
  source: string;
  functions: V8Function[];
}

function normalizePath(file: string): string | null {
  if (file.includes('node_modules')) return null;
  for (const marker of ['/src/app/', '/server/']) {
    const index = file.lastIndexOf(marker);
    if (index !== -1) return file.slice(index + 1);
  }
  return null;
}

/**
 * Merge the V8 coverage entries captured by e2e/fixtures.ts into a report:
 * each entry's source (including its inline source map) is written to a temp
 * file so v8-to-istanbul can map ranges back to the original `.ts` sources.
 * The report lands in `coverage/e2e/` next to the Vitest unit coverage.
 */
export default async function globalTeardown(_config: FullConfig): Promise<void> {
  const rawDir = path.join(process.cwd(), 'coverage/e2e/raw');
  const outDir = path.join(process.cwd(), 'coverage/e2e');
  if (!existsSync(rawDir)) return;

  const rawFiles = readdirSync(rawDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({ name: file, content: readFileSync(path.join(rawDir, file), 'utf8') }));
  rmSync(rawDir, { recursive: true, force: true });
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'formmaker-e2e-cov-'));
  const map = libCoverage.createCoverageMap({});

  for (const { name: file, content } of rawFiles) {
    const entries = JSON.parse(content) as V8Entry[];
    for (let i = 0; i < entries.length; i++) {
      const raw = entries[i];
      if (!raw?.source || !Array.isArray(raw.functions)) continue;
      try {
        const tmp = path.join(tmpDir, `${file}-entry-${i}.js`);
        writeFileSync(tmp, raw.source);
        const converter = v8toIstanbul(tmp);
        await converter.load();
        converter.applyCoverage(raw.functions);
        for (const [filePath, fileCoverage] of Object.entries(converter.toIstanbul())) {
          const normalized = normalizePath(filePath);
          if (!normalized) continue;
          fileCoverage.path = normalized;
          map.addFileCoverage(fileCoverage);
        }
      } catch (error) {
        console.warn(`[e2e coverage] skipped ${raw.url}:`, error);
      }
    }
  }
  rmSync(tmpDir, { recursive: true, force: true });

  const context = libReport.createContext({ dir: outDir, coverageMap: map });
  reports.create('text').execute(context);
  reports.create('lcov').execute(context);
  reports.create('html').execute(context);

  rmSync(rawDir, { recursive: true, force: true });
  console.log(`E2E coverage report written to ${outDir}/index.html`);
}
