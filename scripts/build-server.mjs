// Compiles the Express server (src/server/*.ts) and the shared model it imports
// (src/shared/*) to plain JavaScript with tsc, then marks the emitted directory
// as an ES module so Node runs it without tsx.
//
// tsc emits the server next to the shared model (rootDir = src/), so the
// compiled JS keeps working relative imports like `../shared/...` at runtime.

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist', 'server', 'src');
const esmMarker = JSON.stringify({ type: 'module' }, null, 2) + '\n';

// Clearing the output first keeps stale emits (old dir layouts) out of dist/.
rmSync(outDir, { recursive: true, force: true });

const tsc = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsc', '-p', join('tsconfig.server.json')],
  { cwd: root, stdio: 'inherit' },
);

if (tsc.status !== 0) process.exit(tsc.status ?? 1);

// Mark both emitted subtrees as ES modules so Node resolves their .js files as ESM.
for (const dir of [join(outDir, 'server'), join(outDir, 'shared')]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), esmMarker);
}
