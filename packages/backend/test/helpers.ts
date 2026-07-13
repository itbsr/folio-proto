import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import app from '../src/index';

/**
 * Dispatch a request to the Hono app with the test env and a fresh
 * ExecutionContext. `origin` controls the request URL scheme — cookie
 * attributes (Secure/SameSite/Partitioned) depend on http vs https.
 */
export async function request(
  path: string,
  init?: RequestInit,
  origin = 'http://example.com',
): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await app.fetch(
    new Request(`${origin}/api${path}`, init),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

/** JSON POST helper. Pass `cookie` (e.g. "session=<id>") for authenticated calls. */
export function postJson(
  path: string,
  body: unknown,
  cookie?: string,
  origin?: string,
): Promise<Response> {
  return request(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    },
    origin,
  );
}

export interface TestUser {
  id: string;
  email: string;
  plan: string;
}

/** Register a new user and log in; returns the user and its session cookie. */
export async function registerAndLogin(
  email: string,
  password = 'password123',
): Promise<{ user: TestUser; cookie: string }> {
  const registerRes = await postJson('/auth/register', { email, password });
  if (registerRes.status !== 201) {
    throw new Error(`register failed: ${registerRes.status}`);
  }
  const { user } = await registerRes.json<{ user: TestUser }>();

  const loginRes = await postJson('/auth/login', { email, password });
  if (loginRes.status !== 200) {
    throw new Error(`login failed: ${loginRes.status}`);
  }
  const setCookie = loginRes.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0]; // "session=<uuid>"
  if (!cookie.startsWith('session=')) {
    throw new Error(`unexpected Set-Cookie: ${setCookie}`);
  }
  return { user, cookie };
}
