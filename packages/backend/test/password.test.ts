import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/crypto';
import { postJson } from './helpers';

/** Seed a user row directly, bypassing /auth/register, to control password_hash. */
async function seedUser(email: string, passwordHash: string): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
  )
    .bind(id, email, passwordHash)
    .run();
  return id;
}

describe('password verification robustness (issue #39)', () => {
  it('login against a corrupted password_hash (no delimiter) responds 401, not 500', async () => {
    // A corrupt row: no ':' delimiter and too short to be hex; fromHex() on it
    // throws TypeError in the unfixed code, turning login into a 500.
    await seedUser('corrupt-nodelim@example.com', 'x');

    const res = await postJson('/auth/login', {
      email: 'corrupt-nodelim@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('Invalid email or password');
  });

  it('login against a password_hash with an empty salt segment responds 401, not 500', async () => {
    await seedUser('corrupt-emptysalt@example.com', ':deadbeef');

    const res = await postJson('/auth/login', {
      email: 'corrupt-emptysalt@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(401);
  });

  it('login against a non-hex password_hash responds 401, not 500', async () => {
    await seedUser('corrupt-nonhex@example.com', 'not-hex-at-all:zzzz!!');

    const res = await postJson('/auth/login', {
      email: 'corrupt-nonhex@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(401);
  });

  it('verifyPassword returns false (never throws) for malformed stored values', async () => {
    const malformed = [
      '', // empty
      'deadbeef', // no delimiter
      ':', // empty salt and hash
      'deadbeef:', // empty hash
      ':deadbeef', // empty salt
      'abc:deadbeef', // odd-length salt hex
      'deadbeef:abc', // odd-length hash hex
      'nothex!!:deadbeef', // non-hex salt
      'deadbeef:nothex!!', // non-hex hash
      'aa:bb:cc', // too many delimiters
    ];
    for (const stored of malformed) {
      await expect(
        verifyPassword('password123', stored),
        `verifyPassword should resolve false for ${JSON.stringify(stored)}`,
      ).resolves.toBe(false);
    }
  });

  it('hashPassword output keeps verifying (format unchanged)', async () => {
    const stored = await hashPassword('password123');
    // salt(16 bytes) and 256-bit hash, both lowercase hex, ':'-delimited.
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
    await expect(verifyPassword('password123', stored)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', stored)).resolves.toBe(false);
  });

  it('register then login roundtrip still succeeds', async () => {
    const registerRes = await postJson('/auth/register', {
      email: 'pwtest-ok@example.com',
      password: 'password123',
    });
    expect(registerRes.status).toBe(201);

    const loginRes = await postJson('/auth/login', {
      email: 'pwtest-ok@example.com',
      password: 'password123',
    });
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^session=/);
  });

  it('login with a wrong password still responds 401', async () => {
    const registerRes = await postJson('/auth/register', {
      email: 'pwtest-wrong@example.com',
      password: 'password123',
    });
    expect(registerRes.status).toBe(201);

    const res = await postJson('/auth/login', {
      email: 'pwtest-wrong@example.com',
      password: 'wrong-password',
    });
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('Invalid email or password');
  });
});
