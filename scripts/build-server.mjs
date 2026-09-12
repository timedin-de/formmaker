// Compiles the Express server (server/*.ts) to plain JavaScript with tsc and
// marks the emitted directory as an ES module so Node runs it without tsx.
//
// The server source imports app types from `../src/app/...`; those are type-only
// imports and are elided in the output, but they must still compile, so tsc emits
// them next to the server build (they are intentionally not copied into images).

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist', 'server', 'server');

const tsc = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsc', '-p', join('server', 'tsconfig.build.json')],
  { cwd: root, stdio: 'inherit' },
);

if (tsc.status !== 0) process.exit(tsc.status ?? 1);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n');
