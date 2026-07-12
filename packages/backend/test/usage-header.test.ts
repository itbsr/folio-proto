import { fetchMock } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { registerAndLogin, request } from './helpers';

// Regression coverage for issue #34: the frontend reads the X-Usage response
// header after /images/upload to update the usage display. Cross-origin,
// custom response headers are invisible to JS unless the CORS middleware
// sends Access-Control-Expose-Headers listing them — if that list ever loses
// X-Usage, the header silently disappears in production browsers.

// Same computation as the backend (UTC YYYY-MM).
const month = new Date().toISOString().slice(0, 7);

const FREE_LIMIT = 50;

function mockAiUploadSuccess(jobId: string, resultText = 'processed-image-base64') {
  fetchMock
    .get('https://ai.test')
    .intercept({ method: 'POST', path: `/upload/${jobId}` })
    .reply(200, resultText, {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
}

function uploadImage(jobId: string, cookie: string) {
  const body = JSON.stringify({ image: 'aGVsbG8=' });
  return request(`/images/upload?jobId=${jobId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // The route requires a Content-Length to stream the body onward.
      'Content-Length': String(body.length),
      // Simulate the cross-origin browser request the SPA makes in production.
      Origin: 'https://app.example.com',
      Cookie: cookie,
    },
    body,
  });
}

describe('X-Usage response header (issue #34)', () => {
  it('exposes X-Usage via Access-Control-Expose-Headers and sends a parsable usage payload', async () => {
    const { cookie } = await registerAndLogin('usage-header@example.com');

    const jobId = 'usage-header-job-1';
    mockAiUploadSuccess(jobId);

    const res = await uploadImage(jobId, cookie);
    expect(res.status).toBe(200);

    // Without this, browsers hide X-Usage from cross-origin JS and the
    // frontend usage display can never update after an upload.
    const exposed = (res.headers.get('Access-Control-Expose-Headers') ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase());
    expect(exposed).toContain('x-usage');

    // The header value itself must be JSON with the fields the frontend reads.
    const usageHeader = res.headers.get('X-Usage');
    expect(usageHeader).not.toBeNull();
    const usage = JSON.parse(usageHeader as string) as {
      used: number;
      limit: number;
      month: string;
    };
    expect(usage).toEqual({ used: 1, limit: FREE_LIMIT, month });

    // The result body still streams through unchanged.
    expect(await res.text()).toBe('processed-image-base64');
  });
});
