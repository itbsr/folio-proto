import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { registerSchema, loginSchema, processImageSchema } from '@my-app/shared';
import { hashPassword, verifyPassword } from './lib/crypto';
import { callDewarpNet } from './services/ai';
import { PLAN_LIMITS } from './middleware/quota';
import type { Context } from 'hono';
import type { Bindings } from './types';

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');
app.use('*', cors({ origin: (o) => o ?? '*', credentials: true, allowHeaders: ['Content-Type'] }));

// ── Auth helpers ──────────────────────────────────────────────────────────
async function getSessionUser(c: Context<{ Bindings: Bindings }>) {
  const sessionId = getCookie(c, 'session');
  if (!sessionId) return null;
  return c.env.DB.prepare(
    `SELECT u.id, u.email, u.plan
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now')`
  ).bind(sessionId).first<{ id: string; email: string; plan: 'free' | 'pro' }>();
}

async function checkQuota(db: Bindings['DB'], userId: string, plan: string): Promise<{ ok: boolean; used: number; limit: number; month: string }> {
  const month = new Date().toISOString().slice(0, 7);
  const limit = PLAN_LIMITS[plan] ?? 50;
  const row = await db.prepare(
    'SELECT count FROM usage_quotas WHERE user_id = ? AND month = ?'
  ).bind(userId, month).first<{ count: number }>();
  return { ok: (row?.count ?? 0) < limit, used: row?.count ?? 0, limit, month };
}

// ── Routes ────────────────────────────────────────────────────────────────
const routes = app

  // Auth
  .post('/auth/register', zValidator('json', registerSchema), async (c) => {
    const { email, password } = c.req.valid('json');
    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return c.json({ error: 'Email already registered' }, 400);
    const id = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
      .bind(id, email, await hashPassword(password)).run();
    return c.json({ user: { id, email, plan: 'free' } }, 201);
  })

  .post('/auth/login', zValidator('json', loginSchema), async (c) => {
    const { email, password } = c.req.valid('json');
    const user = await c.env.DB.prepare(
      'SELECT id, email, plan, password_hash FROM users WHERE email = ?'
    ).bind(email).first<{ id: string; email: string; plan: string; password_hash: string }>();
    if (!user || !(await verifyPassword(password, user.password_hash)))
      return c.json({ error: 'Invalid email or password' }, 401);
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);
    await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(sessionId, user.id, expiresAt).run();
    setCookie(c, 'session', sessionId, {
      httpOnly: true, sameSite: 'Lax', path: '/',
      maxAge: 60 * 60 * 24 * 7,
      secure: c.req.url.startsWith('https://'),
    });
    return c.json({ user: { id: user.id, email: user.email, plan: user.plan } });
  })

  .post('/auth/logout', async (c) => {
    const sessionId = getCookie(c, 'session');
    if (sessionId) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    deleteCookie(c, 'session', { path: '/' });
    return c.json({ success: true });
  })

  .get('/auth/me', async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return c.json({ user });
  })

  // Images
  .post('/images/process', zValidator('json', processImageSchema), async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const quota = await checkQuota(c.env.DB, user.id, user.plan);
    if (!quota.ok) return c.json({ error: 'quota_exceeded', used: quota.used, limit: quota.limit }, 429);

    const { image } = c.req.valid('json');
    let resultImage: string;
    try {
      resultImage = await callDewarpNet(c.env.AI_ENDPOINT, c.env.AI_API_KEY, image);
    } catch (e) {
      await c.env.DB.prepare('INSERT INTO usage_logs (user_id, status, error_msg) VALUES (?, ?, ?)')
        .bind(user.id, 'error', e instanceof Error ? e.message : 'unknown').run();
      return c.json({ error: 'Processing failed' }, 502);
    }

    await Promise.all([
      c.env.DB.prepare('INSERT INTO usage_logs (user_id, status) VALUES (?, ?)').bind(user.id, 'success').run(),
      c.env.DB.prepare(
        `INSERT INTO usage_quotas (user_id, month, count) VALUES (?, ?, 1)
         ON CONFLICT (user_id, month) DO UPDATE SET count = count + 1`
      ).bind(user.id, quota.month).run(),
    ]);

    const row = await c.env.DB.prepare(
      'SELECT count FROM usage_quotas WHERE user_id = ? AND month = ?'
    ).bind(user.id, quota.month).first<{ count: number }>();

    return c.json({ result_image: resultImage, usage: { used: row?.count ?? 1, limit: quota.limit, month: quota.month } });
  })

  .get('/images/history', async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const { results } = await c.env.DB.prepare(
      'SELECT id, status, error_msg, created_at FROM usage_logs WHERE user_id = ? ORDER BY id DESC LIMIT 20'
    ).bind(user.id).all();
    return c.json({ history: results ?? [] });
  })

  .get('/images/usage', async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const quota = await checkQuota(c.env.DB, user.id, user.plan);
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    nextMonth.setHours(0, 0, 0, 0);
    return c.json({ month: quota.month, used: quota.used, limit: quota.limit, reset_at: nextMonth.toISOString(), plan: user.plan });
  });

export type AppType = typeof routes;
export default app;
