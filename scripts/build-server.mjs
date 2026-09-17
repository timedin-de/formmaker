// Bundles the Express server (src/server/index.ts) and everything it imports,
// including src/shared/*, into a single self-contained dist/server/index.js
// with ncc. Bundling lets Node run the server without tsx and sidesteps ESM
// extension resolution entirely (webpack resolves relative imports itself).

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ncc = require('@vercel/ncc');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist', 'server');

// Clearing the output first keeps stale emits (old dir layouts) out of dist/.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Runtime dependencies stay in node_modules: native addons (better-sqlite3) and
// packages with dynamic requires (typeorm's platform driver loader) don't
// survive bundling. Everything else from src/ is bundled into the single file.
const { dependencies } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const { code, map, assets } = await ncc(join(root, 'src', 'server', 'index.ts'), {
  externals: Object.keys(dependencies),
  // Only relocate assets that live under src/; the Angular SPA in dist/ is
  // served separately and must not be duplicated into the server bundle.
  filterAssetBase: join(root, 'src'),
  // The server tree is lenient about some tsc diagnostics; type checking stays in
  // `npm run typecheck:server`, so the bundler only transpiles.
  transpileOnly: true,
  cache: true,
  minify: true,
  sourceMap: false,
  target: 'es2022',
  quiet: true,
});

writeFileSync(join(outDir, 'index.js'), code);
if (map) writeFileSync(join(outDir, 'index.js.map'), map);
for (const [name, asset] of Object.entries(assets)) {
  // ncc relocates the default SQLite path as an asset when the local dev DB
  // exists; never ship local runtime data in the bundle.
  if (name.endsWith('.sqlite') || name.endsWith('.sqlite3')) continue;
  const target = join(outDir, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, asset.source);
}
console.log(`Server bundle written to ${join(outDir, 'index.js')}`);
