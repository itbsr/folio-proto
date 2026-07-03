import type { Bindings } from '../src/types';

declare module 'cloudflare:test' {
  // ProvidedEnv is the type of `import { env } from "cloudflare:test"`.
  // It mirrors the Worker's Bindings plus test-only bindings injected in
  // vitest.config.ts.
  interface ProvidedEnv extends Bindings {
    TEST_MIGRATIONS: D1Migration[];
  }
}
