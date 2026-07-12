import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { postJson, request } from './helpers';

/**
 * Format a Date exactly the way the login handler stores expires_at:
 * UTC 'YYYY-MM-DD HH:MM:SS' (same shape as SQLite's datetime('now')).
 */
function sqlTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

const HOUR = 60 * 60 * 1000;

/** Register a user via the API without logging in (login triggers cleanup). */
async function register(email: string): Promise<{ id: string; email: string }> {
  const res = await postJson('/auth/register', { email, password: 'password123' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  const { user } = await res.json<{ user: { id: string; email: string } }>();
  return user;
}

/** Seed a session row directly, bypassing the login handler. */
function insertSession(id: string, userId: string, expiresAt: Date) {
  return env.DB.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
  )
    .bind(id, userId, sqlTimestamp(expiresAt))
    .run();
}

function getSessionRow(id: string) {
  return env.DB.prepare('SELECT id, user_id FROM sessions WHERE id = ?')
    .bind(id)
    .first<{ id: string; user_id: string }>();
}

describe('session cleanup', () => {
  it('successful login deletes all expired sessions (any user) and keeps valid ones', async () => {
    const alice = await register('cleanup-alice@example.com');
    const bob = await register('cleanup-bob@example.com');

    const expiredAlice = crypto.randomUUID();
    const expiredBob = crypto.randomUUID();
    const validBob = crypto.randomUUID();
    await insertSession(expiredAlice, alice.id, new Date(Date.now() - HOUR));
    await insertSession(expiredBob, bob.id, new Date(Date.now() - 7 * 24 * HOUR));
    await insertSession(validBob, bob.id, new Date(Date.now() + 7 * 24 * HOUR));

    const loginRes = await postJson('/auth/login', {
      email: 'cleanup-alice@example.com',
      password: 'password123',
    });
    expect(loginRes.status).toBe(200);

    // Cleanup is global: both users' expired rows are gone.
    expect(await getSessionRow(expiredAlice)).toBeNull();
    expect(await getSessionRow(expiredBob)).toBeNull();

    // Valid rows survive someone else's login cleanup…
    expect(await getSessionRow(validBob)).not.toBeNull();
    // …and still authenticate.
    const meRes = await request('/auth/me', {
      headers: { Cookie: `session=${validBob}` },
    });
    expect(meRes.status).toBe(200);
    const me = await meRes.json<{ user: { id: string } }>();
    expect(me.user.id).toBe(bob.id);

    // Exactly two rows remain: bob's valid session + alice's fresh login session.
    const newAliceSession =
      (loginRes.headers.get('set-cookie') ?? '').match(/^session=([^;]+)/)?.[1];
    expect(newAliceSession).toBeTruthy();
    expect(await getSessionRow(newAliceSession!)).not.toBeNull();
    const { results } = await env.DB.prepare('SELECT id FROM sessions').all<{ id: string }>();
    expect(results.map((r) => r.id).sort()).toEqual(
      [validBob, newAliceSession!].sort(),
    );
  });

  it('presenting an expired session cookie returns 401 and deletes that row', async () => {
    const user = await register('cleanup-carol@example.com');
    const expired = crypto.randomUUID();
    await insertSession(expired, user.id, new Date(Date.now() - HOUR));
    expect(await getSessionRow(expired)).not.toBeNull();

    const res = await request('/auth/me', {
      headers: { Cookie: `session=${expired}` },
    });
    expect(res.status).toBe(401);
    expect(await getSessionRow(expired)).toBeNull();
  });

  it('a valid session cookie authenticates and its row is left untouched', async () => {
    const user = await register('cleanup-dave@example.com');
    const valid = crypto.randomUUID();
    await insertSession(valid, user.id, new Date(Date.now() + 7 * 24 * HOUR));

    const res = await request('/auth/me', {
      headers: { Cookie: `session=${valid}` },
    });
    expect(res.status).toBe(200);
    expect(await getSessionRow(valid)).not.toBeNull();
  });

  it('an unknown session cookie returns 401 without deleting anyone else\'s rows', async () => {
    const user = await register('cleanup-erin@example.com');
    const valid = crypto.randomUUID();
    await insertSession(valid, user.id, new Date(Date.now() + 7 * 24 * HOUR));

    const res = await request('/auth/me', {
      headers: { Cookie: `session=${crypto.randomUUID()}` },
    });
    expect(res.status).toBe(401);
    expect(await getSessionRow(valid)).not.toBeNull();
  });
});
