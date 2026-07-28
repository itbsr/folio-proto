import type { D1Database } from '@cloudflare/workers-types';

export type Bindings = {
  DB: D1Database;
  AI_ENDPOINT: string;
  AI_API_KEY: string;
  /** Comma-separated CORS allowlist (wrangler.toml [vars], per environment). */
  CORS_ORIGINS: string;
};
