import { createMiddleware } from 'hono/factory';
import type { Bindings } from '../types';
import type { User } from '@my-app/shared';

export const PLAN_LIMITS: Record<string, number> = {
  free: 50,
  pro: 1000,
};

export const quotaMiddleware = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
  const user = c.get('user' as never) as User;
  const month = new Date().toISOString().slice(0, 7);
  const limit = PLAN_LIMITS[user.plan] ?? 50;

  const row = await c.env.DB.prepare(
    'SELECT count FROM usage_quotas WHERE user_id = ? AND month = ?'
  )
    .bind(user.id, month)
    .first<{ count: number }>();

  if ((row?.count ?? 0) >= limit) {
    return c.json({ error: 'quota_exceeded', used: row?.count, limit }, 429);
  }

  await next();
});
