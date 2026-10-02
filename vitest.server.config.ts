import { defineConfig } from 'vitest/config';

// Server specs run in plain vitest (not `ng test`). Nest needs legacy
// decorators, matching tsconfig.server.json.
export default defineConfig({
  oxc: { decorator: { legacy: true } },
  test: { include: ['src/server/**/*.spec.ts'], environment: 'node' },
});
