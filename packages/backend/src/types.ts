import type { D1Database } from '@cloudflare/workers-types';
import type { User } from '@my-app/shared';

export type Bindings = {
  DB: D1Database;
  AI_ENDPOINT: string;
  AI_API_KEY: string;
  /** Comma-separated CORS allowlist (wrangler.toml [vars], per environment). */
  CORS_ORIGINS: string;
};

export type Variables = {
  user: User;
};
