import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Bindings } from '../types';

export const authMiddleware = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
  const sessionId = getCookie(c, 'session');
  if (!sessionId) return c.json({ error: 'Unauthorized' }, 401);

  const user = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.plan
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now')`
  )
    .bind(sessionId)
    .first<{ id: string; email: string; plan: 'free' | 'pro' }>();

  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  c.set('user' as never, user);
  await next();
});
