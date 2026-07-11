import { describe, expect, it } from 'vitest';
import { postJson, registerAndLogin, request } from './helpers';

describe('auth', () => {
  it('register, then login, then protected endpoint succeeds with the session cookie', async () => {
    const registerRes = await postJson('/auth/register', {
      email: 'alice@example.com',
      password: 'password123',
    });
    expect(registerRes.status).toBe(201);
    const registered = await registerRes.json<{
      user: { id: string; email: string; plan: string };
    }>();
    expect(registered.user.email).toBe('alice@example.com');
    expect(registered.user.plan).toBe('free');

    const loginRes = await postJson('/auth/login', {
      email: 'alice@example.com',
      password: 'password123',
    });
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^session=[0-9a-f-]+;/);
    expect(setCookie).toMatch(/HttpOnly/i);

    const cookie = setCookie.split(';')[0];
    const meRes = await request('/auth/me', { headers: { Cookie: cookie } });
    expect(meRes.status).toBe(200);
    const me = await meRes.json<{ user: { id: string; email: string } }>();
    expect(me.user.id).toBe(registered.user.id);
    expect(me.user.email).toBe('alice@example.com');
  });

  it('rejects a protected endpoint without a session cookie', async () => {
    const res = await request('/auth/me');
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects a protected endpoint with an unknown session cookie', async () => {
    const res = await request('/auth/me', {
      headers: { Cookie: 'session=00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects login with a wrong password', async () => {
    await registerAndLogin('bob@example.com', 'password123');
    const res = await postJson('/auth/login', {
      email: 'bob@example.com',
      password: 'wrong-password',
    });
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('Invalid email or password');
  });

  it('rejects registering an already-registered email', async () => {
    await registerAndLogin('carol@example.com');
    const res = await postJson('/auth/register', {
      email: 'carol@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('Email already registered');
  });

  it('rejects registration with a password shorter than 8 characters', async () => {
    const res = await postJson('/auth/register', {
      email: 'dave@example.com',
      password: 'short',
    });
    expect(res.status).toBe(400);
  });
});

// Cross-site session cookie attributes (issue #97): the frontend (pages.dev)
// and backend (workers.dev) are cross-SITE, so the cookie is third-party and
// must be SameSite=None; Secure; Partitioned (CHIPS) for iOS WebKit to keep it.
describe('session cookie attributes', () => {
  it('login over https sets SameSite=None; Secure; Partitioned', async () => {
    await postJson('/auth/register', {
      email: 'erin@example.com',
      password: 'password123',
    });
    const res = await postJson(
      '/auth/login',
      { email: 'erin@example.com', password: 'password123' },
      undefined,
      'https://example.com',
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^session=[0-9a-f-]+;/);
    expect(setCookie).toMatch(/SameSite=None/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/Partitioned/i);
  });

  it('login over http sets SameSite=Lax without Secure or Partitioned', async () => {
    await postJson('/auth/register', {
      email: 'frank@example.com',
      password: 'password123',
    });
    const res = await postJson('/auth/login', {
      email: 'frank@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^session=[0-9a-f-]+;/);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/Secure/i);
    expect(setCookie).not.toMatch(/Partitioned/i);
  });

  it('logout over https deletes the cookie with matching Partitioned attributes', async () => {
    const { cookie } = await registerAndLogin('grace@example.com');
    const res = await postJson('/auth/logout', {}, cookie, 'https://example.com');
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^session=;/);
    expect(setCookie).toMatch(/Max-Age=0/i);
    expect(setCookie).toMatch(/SameSite=None/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/Partitioned/i);
  });
});
