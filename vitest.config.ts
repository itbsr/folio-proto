import { defineConfig } from 'vitest/config';

// Root Vitest config: runs every package's test project with a single
// `npm test` (`vitest run`). Each package defines its own environment
// (shared → node, backend → workerd via @cloudflare/vitest-pool-workers,
// frontend → jsdom).
export default defineConfig({
  test: {
    projects: [
      'packages/shared/vitest.config.ts',
      'packages/backend/vitest.config.ts',
      'packages/frontend/vitest.config.ts',
    ],
  },
});
