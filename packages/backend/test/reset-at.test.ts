import { describe, expect, it } from 'vitest';
import { registerAndLogin, request } from './helpers';

// Quota months are keyed by UTC (YYYY-MM), so reset_at must be the first
// instant of the NEXT UTC month, independent of the server's local timezone.
// Note: workerd pins the test runtime to UTC, so the local-TZ drift bug
// (issue #55) cannot itself be reproduced here — this test guards the
// contract that reset_at is always the UTC month boundary.
describe('GET /images/usage reset_at', () => {
  it('is the first instant of the month after the current UTC month', async () => {
    const { cookie } = await registerAndLogin('reset-at@example.com');

    const res = await request('/images/usage', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = await res.json<{ month: string; reset_at: string }>();

    const now = new Date();
    const expected = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    expect(body.reset_at).toBe(expected.toISOString());

    // Parses as a valid ISO timestamp at exactly 00:00:00.000Z on the 1st.
    const parsed = new Date(body.reset_at);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(parsed.toISOString()).toBe(body.reset_at);
    expect(body.reset_at).toMatch(/^\d{4}-\d{2}-01T00:00:00\.000Z$/);

    // reset_at belongs to the month right after the reported quota month.
    const [y, m] = body.month.split('-').map(Number);
    const monthAfterQuotaMonth = new Date(Date.UTC(y, m, 1)); // m is 1-based → next month
    expect(body.reset_at).toBe(monthAfterQuotaMonth.toISOString());
  });
});
