import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { processImageSchema } from '@my-app/shared';
import { authMiddleware } from '../middleware/auth';
import { quotaMiddleware, PLAN_LIMITS } from '../middleware/quota';
import { callDewarpNet } from '../services/ai';
import type { Bindings } from '../types';
import type { User } from '@my-app/shared';

const images = new Hono<{ Bindings: Bindings }>();

images.post(
  '/process',
  authMiddleware,
  quotaMiddleware,
  zValidator('json', processImageSchema),
  async (c) => {
    const { image } = c.req.valid('json');
    const user = c.get('user' as never) as User;
    const month = new Date().toISOString().slice(0, 7);

    let resultImage: string;
    try {
      resultImage = await callDewarpNet(c.env.AI_ENDPOINT, c.env.AI_API_KEY, image);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      await c.env.DB.prepare(
        'INSERT INTO usage_logs (user_id, status, error_msg) VALUES (?, ?, ?)'
      ).bind(user.id, 'error', errorMsg).run();
      return c.json({ error: 'Processing failed' }, 502);
    }

    await Promise.all([
      c.env.DB.prepare(
        'INSERT INTO usage_logs (user_id, status) VALUES (?, ?)'
      ).bind(user.id, 'success').run(),
      c.env.DB.prepare(
        `INSERT INTO usage_quotas (user_id, month, count) VALUES (?, ?, 1)
         ON CONFLICT (user_id, month) DO UPDATE SET count = count + 1`
      ).bind(user.id, month).run(),
    ]);

    const row = await c.env.DB.prepare(
      'SELECT count FROM usage_quotas WHERE user_id = ? AND month = ?'
    ).bind(user.id, month).first<{ count: number }>();

    return c.json({
      result_image: resultImage,
      usage: {
        used: row?.count ?? 1,
        limit: PLAN_LIMITS[user.plan] ?? 50,
        month,
      },
    });
  }
);

images.get('/history', authMiddleware, async (c) => {
  const user = c.get('user' as never) as User;
  const { results } = await c.env.DB.prepare(
    `SELECT id, status, error_msg, created_at
     FROM usage_logs WHERE user_id = ?
     ORDER BY id DESC LIMIT 20`
  ).bind(user.id).all();
  return c.json({ history: results ?? [] });
});

images.get('/usage', authMiddleware, async (c) => {
  const user = c.get('user' as never) as User;
  const month = new Date().toISOString().slice(0, 7);
  const row = await c.env.DB.prepare(
    'SELECT count FROM usage_quotas WHERE user_id = ? AND month = ?'
  ).bind(user.id, month).first<{ count: number }>();

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  nextMonth.setHours(0, 0, 0, 0);

  return c.json({
    month,
    used: row?.count ?? 0,
    limit: PLAN_LIMITS[user.plan] ?? 50,
    reset_at: nextMonth.toISOString(),
    plan: user.plan,
  });
});

export default images;
