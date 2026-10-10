import path from 'path';
import { defineConfig } from 'vitest/config';
// Server specs run in plain vitest (not `ng test`). Nest needs legacy
// decorators, matching tsconfig.server.json.

export default defineConfig({
  oxc: { decorator: { legacy: true } },
  test: { include: ['src/server/**/*.spec.ts'], environment: 'node' },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
      '@test': path.resolve(__dirname, './tests'),
    },
  },
});
