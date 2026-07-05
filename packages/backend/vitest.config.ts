import path from 'node:path';
import {
  defineWorkersProject,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config';

// Backend tests run inside workerd (Miniflare) with a real D1 database.
// The production wrangler.toml is read for bindings; test-only settings
// (compatibility flags, AI server endpoint/key, migrations) are injected
// here so wrangler.toml itself stays untouched.
export default defineWorkersProject(async () => {
  // Read all D1 migrations; test/setup.ts applies them via applyD1Migrations().
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));

  return {
    test: {
      name: 'backend',
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/setup.ts'],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            // The Workers Vitest integration requires nodejs_compat. It is
            // enabled only for tests; production wrangler.toml is unchanged.
            compatibilityFlags: ['nodejs_compat'],
            bindings: {
              // Deterministic, offline stand-ins for the Wrangler secrets.
              // Outbound fetch to AI_ENDPOINT is mocked with fetchMock.
              AI_ENDPOINT: 'https://ai.test',
              AI_API_KEY: 'test-ai-key',
              TEST_MIGRATIONS: migrations,
            },
          },
        },
      },
    },
  };
});
