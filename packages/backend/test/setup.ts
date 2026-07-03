import { applyD1Migrations, env, fetchMock } from 'cloudflare:test';
import { afterEach, beforeAll } from 'vitest';

// Apply all D1 migrations (read by vitest.config.ts via readD1Migrations)
// before any test file runs. Runs once per test file; already-applied
// migrations are tracked in the d1_migrations table and skipped.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

beforeAll(() => {
  // Intercept all outbound fetch()es (the AI server calls) and fail loudly
  // on any request that is not explicitly mocked — tests stay offline.
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  // Every interceptor a test registers must have been consumed.
  fetchMock.assertNoPendingInterceptors();
});
