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
