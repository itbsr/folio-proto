import { env, fetchMock } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { postJson, registerAndLogin } from './helpers';

// Regression tests for issue #36: the quota check used to be check-then-act
// (SELECT count → compare → call AI → increment), so concurrent requests at
// the limit boundary could all pass the stale check and exceed the monthly
// limit. Quota is now reserved atomically (single guarded UPSERT) before the
// AI call and refunded if inference fails.

// Same computation as the backend (UTC YYYY-MM).
const month = new Date().toISOString().slice(0, 7);

const FREE_LIMIT = 50;

function getQuotaRow(userId: string) {
  return env.DB.prepare(
    'SELECT count FROM usage_quotas WHERE user_id = ? AND month = ?',
  )
    .bind(userId, month)
    .first<{ count: number }>();
}

function setQuotaCount(userId: string, count: number) {
  return env.DB.prepare(
    'INSERT INTO usage_quotas (user_id, month, count) VALUES (?, ?, ?)',
  )
    .bind(userId, month, count)
    .run();
}

function processImage(cookie: string) {
  return postJson('/images/process', { image: 'aGVsbG8=' }, cookie);
}

describe('quota race (issue #36)', () => {
  it('at limit-1 the last slot is granted, then the next request gets 429 without an AI call', async () => {
    const { user, cookie } = await registerAndLogin('race-last-slot@example.com');
    await setQuotaCount(user.id, FREE_LIMIT - 1);

    fetchMock
      .get('https://ai.test')
      .intercept({ method: 'POST', path: '/process' })
      .reply(200, { result_image: 'processed' });

    const res = await processImage(cookie);
    expect(res.status).toBe(200);
    const body = await res.json<{ usage: { used: number; limit: number } }>();
    expect(body.usage.used).toBe(FREE_LIMIT);
    expect((await getQuotaRow(user.id))?.count).toBe(FREE_LIMIT);

    // The single interceptor above is now consumed: if this request reached
    // the AI server it would fail loudly via disableNetConnect() in setup.ts.
    const res2 = await processImage(cookie);
    expect(res2.status).toBe(429);
    const err = await res2.json<{ error: string; used: number; limit: number }>();
    expect(err).toEqual({
      error: 'quota_exceeded',
      used: FREE_LIMIT,
      limit: FREE_LIMIT,
    });
    expect((await getQuotaRow(user.id))?.count).toBe(FREE_LIMIT);
  });

  it('two concurrent requests for the last slot: exactly one 200 and one 429, count == limit', async () => {
    const { user, cookie } = await registerAndLogin('race-concurrent@example.com');
    await setQuotaCount(user.id, FREE_LIMIT - 1);

    // times(2): the mock is ready to serve BOTH requests (as the old
    // check-then-act code would have allowed) — the atomic reservation must
    // ensure only one request ever reaches the AI server.
    let aiCalls = 0;
    fetchMock
      .get('https://ai.test')
      .intercept({ method: 'POST', path: '/process' })
      .reply(200, () => {
        aiCalls++;
        return { result_image: 'processed' };
      })
      .times(2);

    const [a, b] = await Promise.all([processImage(cookie), processImage(cookie)]);

    expect([a.status, b.status].sort()).toEqual([200, 429]);
    expect(aiCalls).toBe(1);
    expect((await getQuotaRow(user.id))?.count).toBe(FREE_LIMIT);

    // The mock still has one unused upstream slot — proof the 429 request
    // never reached the AI server. Consume it directly so setup.ts's
    // afterEach assertNoPendingInterceptors stays green.
    const leftover = await fetch('https://ai.test/process', { method: 'POST' });
    expect(leftover.status).toBe(200);

    const ok = a.status === 200 ? a : b;
    const okBody = await ok.json<{ usage: { used: number } }>();
    expect(okBody.usage.used).toBe(FREE_LIMIT);

    const rejected = a.status === 429 ? a : b;
    const errBody = await rejected.json<{ error: string; limit: number }>();
    expect(errBody.error).toBe('quota_exceeded');
    expect(errBody.limit).toBe(FREE_LIMIT);
  });

  it('AI failure refunds the reserved slot: count is net unchanged and the error is logged', async () => {
    const { user, cookie } = await registerAndLogin('race-refund@example.com');
    await setQuotaCount(user.id, 5);

    fetchMock
      .get('https://ai.test')
      .intercept({ method: 'POST', path: '/process' })
      .reply(500, 'inference crashed');

    const res = await processImage(cookie);
    expect(res.status).toBe(502);

    // Reserved slot was given back — net usage unchanged…
    expect((await getQuotaRow(user.id))?.count).toBe(5);

    // …and the failure is still recorded in usage_logs.
    const log = await env.DB.prepare(
      'SELECT status, error_msg FROM usage_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1',
    )
      .bind(user.id)
      .first<{ status: string; error_msg: string }>();
    expect(log?.status).toBe('error');
    expect(log?.error_msg).toContain('500');
  });
});
