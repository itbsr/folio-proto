import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { registerSchema, loginSchema, processImageSchema } from '@my-app/shared';
import { hashPassword, verifyPassword } from './lib/crypto';
import { isOriginAllowed, parseAllowedOrigins } from './lib/cors';
import { callDewarpNet, streamDewarpNet, uploadToAi, aiProgressStream } from './services/ai';
import { PLAN_LIMITS } from './lib/quota';
import type { Context } from 'hono';
import type { Bindings } from './types';

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');
// Only origins allowlisted in CORS_ORIGINS get an Access-Control-Allow-Origin
// header (echoed exactly, as required with credentials). Everything else —
// including requests without an Origin — gets none. See src/lib/cors.ts.
app.use('*', cors({
  origin: (origin, c) =>
    isOriginAllowed(origin, parseAllowedOrigins((c.env as Bindings).CORS_ORIGINS)) ? origin : null,
  credentials: true,
  allowHeaders: ['Content-Type'],
  exposeHeaders: ['X-Usage', 'X-Result-Bytes'],
}));

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

// ── Quota helpers ─────────────────────────────────────────────────────────
// Quota is enforced as an atomic reserve → refund-on-failure protocol
// (issue #36). A single guarded UPSERT reserves a slot BEFORE the AI call,
// so concurrent requests can never both pass a stale read-then-check. If
// inference then fails, the reservation is refunded, preserving the rule
// that only successful inferences consume quota.

type QuotaReservation = { ok: boolean; used: number; limit: number; month: string };

async function reserveQuota(db: Bindings['DB'], userId: string, plan: string): Promise<QuotaReservation> {
  const month = new Date().toISOString().slice(0, 7);
  const limit = PLAN_LIMITS[plan] ?? 50;
  // Single atomic statement: the UPDATE arm only fires while count < limit,
  // so at most `limit` reservations can succeed per month no matter how many
  // requests race. RETURNING yields no row when the guard rejects it.
  const row = await db.prepare(
    `INSERT INTO usage_quotas (user_id, month, count) VALUES (?, ?, 1)
     ON CONFLICT (user_id, month) DO UPDATE SET count = count + 1 WHERE count < ?
     RETURNING count`
  ).bind(userId, month, limit).first<{ count: number }>();
  if (row) return { ok: true, used: row.count, limit, month };
  const current = await db.prepare(
    'SELECT count FROM usage_quotas WHERE user_id = ? AND month = ?'
  ).bind(userId, month).first<{ count: number }>();
  return { ok: false, used: current?.count ?? limit, limit, month };
}

function refundQuota(db: Bindings['DB'], userId: string, month: string) {
  return db.prepare(
    'UPDATE usage_quotas SET count = count - 1 WHERE user_id = ? AND month = ? AND count > 0'
  ).bind(userId, month).run();
}

async function getQuotaUsage(db: Bindings['DB'], userId: string, plan: string): Promise<{ used: number; limit: number; month: string }> {
  const month = new Date().toISOString().slice(0, 7);
  const limit = PLAN_LIMITS[plan] ?? 50;
  const row = await db.prepare(
    'SELECT count FROM usage_quotas WHERE user_id = ? AND month = ?'
  ).bind(userId, month).first<{ count: number }>();
  return { used: row?.count ?? 0, limit, month };
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
    // Cross-site cookie (frontend and API on separate origins): the session
    // cookie must be SameSite=None; Secure to be sent on cross-site requests.
    // It must also be Partitioned (CHIPS): pages.dev and workers.dev are both
    // on the Public Suffix List, so the cookie is third-party and iOS WebKit's
    // ITP silently drops unpartitioned third-party cookies (issue #97 — login
    // returned 200 but every later request was 401 on iPhone). Partitioning is
    // harmless here since the app is always used from the same top-level site,
    // and CHIPS-unaware browsers simply ignore the attribute. Note: iOS ≤18.3
    // lacks CHIPS support and still fails; full fix is same-origin hosting.
    // In local dev (http, same-origin via Vite proxy) fall back to Lax, since
    // SameSite=None and Partitioned both require Secure, and browsers drop
    // Secure cookies over http.
    const isHttps = c.req.url.startsWith('https://');
    setCookie(c, 'session', sessionId, {
      httpOnly: true, sameSite: isHttps ? 'None' : 'Lax', path: '/',
      maxAge: 60 * 60 * 24 * 7,
      secure: isHttps,
      partitioned: isHttps,
    });
    return c.json({ user: { id: user.id, email: user.email, plan: user.plan } });
  })

  .post('/auth/logout', async (c) => {
    const sessionId = getCookie(c, 'session');
    if (sessionId) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    // A partitioned cookie lives in a partitioned jar, so the deletion
    // Set-Cookie must carry the same Secure/SameSite=None/Partitioned
    // attributes as login's, or the browser won't match (and delete) it.
    const isHttps = c.req.url.startsWith('https://');
    deleteCookie(c, 'session', {
      httpOnly: true, sameSite: isHttps ? 'None' : 'Lax', path: '/',
      secure: isHttps,
      partitioned: isHttps,
    });
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
    const quota = await reserveQuota(c.env.DB, user.id, user.plan);
    if (!quota.ok) return c.json({ error: 'quota_exceeded', used: quota.used, limit: quota.limit }, 429);

    const { image } = c.req.valid('json');
    let resultImage: string;
    try {
      resultImage = await callDewarpNet(c.env.AI_ENDPOINT, c.env.AI_API_KEY, image);
    } catch (e) {
      await Promise.all([
        refundQuota(c.env.DB, user.id, quota.month),
        c.env.DB.prepare('INSERT INTO usage_logs (user_id, status, error_msg) VALUES (?, ?, ?)')
          .bind(user.id, 'error', e instanceof Error ? e.message : 'unknown').run(),
      ]);
      return c.json({ error: 'Processing failed' }, 502);
    }

    await c.env.DB.prepare('INSERT INTO usage_logs (user_id, status) VALUES (?, ?)').bind(user.id, 'success').run();

    return c.json({ result_image: resultImage, usage: { used: quota.used, limit: quota.limit, month: quota.month } });
  })

  .post('/images/process-stream', zValidator('json', processImageSchema), async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const quota = await reserveQuota(c.env.DB, user.id, user.plan);
    if (!quota.ok) return c.json({ error: 'quota_exceeded', used: quota.used, limit: quota.limit }, 429);

    const { image } = c.req.valid('json');

    let aiResponse: Response;
    try {
      aiResponse = await streamDewarpNet(c.env.AI_ENDPOINT, c.env.AI_API_KEY, image);
    } catch (e) {
      await Promise.all([
        refundQuota(c.env.DB, user.id, quota.month),
        c.env.DB.prepare('INSERT INTO usage_logs (user_id, status, error_msg) VALUES (?, ?, ?)')
          .bind(user.id, 'error', e instanceof Error ? e.message : 'unknown').run(),
      ]);
      return c.json({ error: 'Processing failed' }, 502);
    }

    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const db = c.env.DB;
    const userId = user.id;
    const month = quota.month;
    const planLimit = quota.limit;

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    const reservedUsed = quota.used;

    (async () => {
      const reader = aiResponse.body!.getReader();
      let buffer = '';
      // The slot was reserved up front; it is only kept if the stream reaches
      // a 'done' event (successful inference). Any other outcome — error
      // event, upstream drop, client disconnect — refunds it in `finally`.
      let completed = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            if (!part.startsWith('data: ')) {
              await writer.write(enc.encode(part + '\n\n'));
              continue;
            }
            let event: Record<string, unknown>;
            try { event = JSON.parse(part.slice(6).trim()); } catch { continue; }

            if (event.stage === 'done') {
              completed = true;
              await db.prepare('INSERT INTO usage_logs (user_id, status) VALUES (?, ?)').bind(userId, 'success').run();
              event.usage = { used: reservedUsed, limit: planLimit, month };
            } else if (event.error) {
              await db.prepare('INSERT INTO usage_logs (user_id, status, error_msg) VALUES (?, ?, ?)')
                .bind(userId, 'error', String(event.error)).run();
            }

            await writer.write(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
        }
      } finally {
        if (!completed) await refundQuota(db, userId, month).catch(() => {});
        reader.releaseLock();
        await writer.close().catch(() => {});
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  })

  // ── Design A: #2 XHR — image up (request body) + result down (response body) ─
  // ① 上り送信 and ④ 下り受信 are measured client-side on the XHR itself. This
  // route forwards the image to the AI; once inference succeeds it records usage
  // and streams the result (base64 text) straight back as THIS response. usage
  // rides in the X-Usage header; Content-Length is passed through for ④ progress.
  .post('/images/upload', async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const jobId = c.req.query('jobId');
    if (!jobId) return c.json({ error: 'jobId required' }, 400);

    const total = Number(c.req.header('content-length') ?? 0);
    const body = c.req.raw.body;
    if (!body || !total) return c.json({ error: 'empty body' }, 400);

    const quota = await reserveQuota(c.env.DB, user.id, user.plan);
    if (!quota.ok) return c.json({ error: 'quota_exceeded', used: quota.used, limit: quota.limit }, 429);

    let aiRes: Response;
    try {
      aiRes = await uploadToAi(
        c.env.AI_ENDPOINT, c.env.AI_API_KEY, jobId, body, total,
        c.req.header('content-type') ?? 'application/json',
      );
    } catch (e) {
      await Promise.all([
        refundQuota(c.env.DB, user.id, quota.month),
        c.env.DB.prepare('INSERT INTO usage_logs (user_id, status, error_msg) VALUES (?, ?, ?)')
          .bind(user.id, 'error', e instanceof Error ? e.message : 'upload failed').run(),
      ]);
      return c.json({ error: 'Upload failed' }, 502);
    }
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => aiRes.statusText);
      await Promise.all([
        refundQuota(c.env.DB, user.id, quota.month),
        c.env.DB.prepare('INSERT INTO usage_logs (user_id, status, error_msg) VALUES (?, ?, ?)')
          .bind(user.id, 'error', t.slice(0, 500)).run(),
      ]);
      return c.json({ error: 'Processing failed' }, 502);
    }

    // Inference succeeded (AI is about to stream the result). The slot
    // reserved before the upload is kept; log the success now.
    await c.env.DB.prepare('INSERT INTO usage_logs (user_id, status) VALUES (?, ?)').bind(user.id, 'success').run();
    const usage = { used: quota.used, limit: quota.limit, month: quota.month };

    // Stream the AI's result body straight back; carry usage in a header.
    const headers = new Headers();
    headers.set('Content-Type', aiRes.headers.get('content-type') ?? 'text/plain; charset=utf-8');
    const cl = aiRes.headers.get('content-length');
    if (cl) headers.set('Content-Length', cl);          // lets the browser compute ④ download %
    const rb = aiRes.headers.get('x-result-bytes');
    if (rb) headers.set('X-Result-Bytes', rb);          // fallback total if CL is stripped (chunked/gzip)
    headers.set('Cache-Control', 'no-transform');       // stop CF/proxy gzip from dropping Content-Length
    headers.set('X-Usage', JSON.stringify(usage));
    return new Response(aiRes.body, { status: 200, headers });
  })

  // ── Design A: #1 SSE — server-side status only (② 上り受信 / ③ 推論 / ③' 下り送信) ─
  // Pure progress side-channel; result, usage and completion are on #2 (/upload).
  // If this drops, only the server-side bars stop — the result still arrives.
  .get('/images/progress', async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const jobId = c.req.query('jobId');
    if (!jobId) return c.json({ error: 'jobId required' }, 400);

    let aiResponse: Response;
    try {
      aiResponse = await aiProgressStream(c.env.AI_ENDPOINT, c.env.AI_API_KEY, jobId);
    } catch {
      return c.json({ error: 'Processing failed' }, 502);
    }
    if (!aiResponse.ok || !aiResponse.body) return c.json({ error: 'Processing failed' }, 502);

    return new Response(aiResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
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
    const quota = await getQuotaUsage(c.env.DB, user.id, user.plan);
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    nextMonth.setHours(0, 0, 0, 0);
    return c.json({ month: quota.month, used: quota.used, limit: quota.limit, reset_at: nextMonth.toISOString(), plan: user.plan });
  });

export type AppType = typeof routes;
export default app;
