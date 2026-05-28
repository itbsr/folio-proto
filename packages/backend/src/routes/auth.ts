import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { registerSchema, loginSchema } from '@my-app/shared';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { authMiddleware } from '../middleware/auth';
import type { Bindings } from '../types';
import type { User } from '@my-app/shared';

const auth = new Hono<{ Bindings: Bindings }>();

auth.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();
  if (existing) return c.json({ error: 'Email already registered' }, 400);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)'
  ).bind(id, email, passwordHash).run();

  return c.json({ user: { id, email, plan: 'free' } }, 201);
});

auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await c.env.DB.prepare(
    'SELECT id, email, plan, password_hash FROM users WHERE email = ?'
  ).bind(email).first<{ id: string; email: string; plan: string; password_hash: string }>();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);

  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, user.id, expiresAt).run();

  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    secure: c.req.url.startsWith('https://'),
  });

  return c.json({ user: { id: user.id, email: user.email, plan: user.plan } });
});

auth.post('/logout', async (c) => {
  const sessionId = getCookie(c, 'session');
  if (sessionId) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }
  deleteCookie(c, 'session', { path: '/' });
  return c.json({ success: true });
});

auth.get('/me', authMiddleware, (c) => {
  const user = c.get('user' as never) as User;
  return c.json({ user });
});

export default auth;
