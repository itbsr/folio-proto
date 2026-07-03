import { env, fetchMock } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { postJson, registerAndLogin } from './helpers';

// Same computation as the backend (UTC YYYY-MM).
const month = new Date().toISOString().slice(0, 7);

const FREE_LIMIT = 50;

function mockAiSuccess(resultImage = 'processed-image-base64') {
  fetchMock
    .get('https://ai.test')
    .intercept({ method: 'POST', path: '/process' })
    .reply(200, { result_image: resultImage });
}

function mockAiFailure() {
  fetchMock
    .get('https://ai.test')
    .intercept({ method: 'POST', path: '/process' })
    .reply(500, 'inference crashed');
}

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

describe('quota', () => {
  it('first successful processing creates a usage_quotas row for the current month', async () => {
    const { user, cookie } = await registerAndLogin('quota-first@example.com');
    expect(await getQuotaRow(user.id)).toBeNull();

    mockAiSuccess();
    const res = await processImage(cookie);
    expect(res.status).toBe(200);
    const body = await res.json<{
      result_image: string;
      usage: { used: number; limit: number; month: string };
    }>();
    expect(body.result_image).toBe('processed-image-base64');
    expect(body.usage).toEqual({ used: 1, limit: FREE_LIMIT, month });

    const row = await getQuotaRow(user.id);
    expect(row?.count).toBe(1);
  });

  it('successful processing increments an existing usage_quotas row', async () => {
    const { user, cookie } = await registerAndLogin('quota-inc@example.com');
    await setQuotaCount(user.id, 5);

    mockAiSuccess();
    const res = await processImage(cookie);
    expect(res.status).toBe(200);
    const body = await res.json<{ usage: { used: number } }>();
    expect(body.usage.used).toBe(6);

    const row = await getQuotaRow(user.id);
    expect(row?.count).toBe(6);
  });

  it('rejects with 429 once the free plan limit is reached, without calling the AI server', async () => {
    const { user, cookie } = await registerAndLogin('quota-full@example.com');
    await setQuotaCount(user.id, FREE_LIMIT);

    // No fetchMock interceptor is registered: any AI call would fail the
    // test via disableNetConnect() in test/setup.ts.
    const res = await processImage(cookie);
    expect(res.status).toBe(429);
    const body = await res.json<{
      error: string;
      used: number;
      limit: number;
    }>();
    expect(body.error).toBe('quota_exceeded');
    expect(body.used).toBe(FREE_LIMIT);
    expect(body.limit).toBe(FREE_LIMIT);

    const row = await getQuotaRow(user.id);
    expect(row?.count).toBe(FREE_LIMIT); // unchanged
  });

  it('does not record usage when the AI server fails', async () => {
    const { user, cookie } = await registerAndLogin('quota-fail@example.com');

    mockAiFailure();
    const res = await processImage(cookie);
    expect(res.status).toBe(502);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('Processing failed');

    // Quota is NOT consumed on failure…
    expect(await getQuotaRow(user.id)).toBeNull();

    // …but the failure is logged in usage_logs (current behavior).
    const log = await env.DB.prepare(
      'SELECT status FROM usage_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1',
    )
      .bind(user.id)
      .first<{ status: string }>();
    expect(log?.status).toBe('error');
  });
});
