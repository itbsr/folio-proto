import { env, fetchMock } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { registerAndLogin, request } from './helpers';

// Design A jobId hardening (issue #37): strict UUID format validation on
// /images/upload and /images/progress, plus per-user job ownership binding.

function mockAiUpload(jobId: string, result = 'RESULT_BYTES') {
  fetchMock
    .get('https://ai.test')
    .intercept({ method: 'POST', path: `/upload/${jobId}` })
    .reply(200, result, { headers: { 'content-type': 'text/plain' } });
}

function mockAiProgress(jobId: string) {
  fetchMock
    .get('https://ai.test')
    .intercept({ method: 'GET', path: `/progress/${jobId}` })
    .reply(200, 'data: {"type":"received","pct":100}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    });
}

/** POST /images/upload with an explicit Content-Length (the route requires it). */
function upload(jobId: string, cookie: string): Promise<Response> {
  const body = JSON.stringify({ image: 'aGVsbG8=' });
  return request(`/images/upload?jobId=${encodeURIComponent(jobId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(body.length),
      Cookie: cookie,
    },
    body,
  });
}

function progress(jobId: string, cookie: string): Promise<Response> {
  return request(`/images/progress?jobId=${encodeURIComponent(jobId)}`, {
    headers: { Cookie: cookie },
  });
}

describe('jobId format validation', () => {
  // None of these may reach the AI server: no fetchMock interceptor is
  // registered, so a forwarded request would fail via disableNetConnect().
  const malformed = [
    'not-a-uuid',
    '../admin', // path traversal (sent URL-encoded as %2E%2E%2Fadmin)
    '123e4567-e89b-12d3-a456-42661417400', // one hex digit short
    '',
  ];

  it('rejects malformed jobIds on /images/upload with 400', async () => {
    const { cookie } = await registerAndLogin('jobs-fmt-upload@example.com');
    for (const jobId of malformed) {
      const res = await upload(jobId, cookie);
      expect(res.status, `jobId=${JSON.stringify(jobId)}`).toBe(400);
    }
  });

  it('rejects malformed jobIds on /images/progress with 400', async () => {
    const { cookie } = await registerAndLogin('jobs-fmt-progress@example.com');
    for (const jobId of malformed) {
      const res = await progress(jobId, cookie);
      expect(res.status, `jobId=${JSON.stringify(jobId)}`).toBe(400);
    }
  });

  it('rejects a missing jobId with 400', async () => {
    const { cookie } = await registerAndLogin('jobs-fmt-missing@example.com');
    const up = await request('/images/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: '{}',
    });
    expect(up.status).toBe(400);
    const pr = await request('/images/progress', { headers: { Cookie: cookie } });
    expect(pr.status).toBe(400);
  });
});

describe('job ownership', () => {
  it('accepts the owner: upload binds the job, progress streams for the same user', async () => {
    const { user, cookie } = await registerAndLogin('jobs-owner@example.com');
    const jobId = crypto.randomUUID();

    mockAiUpload(jobId);
    const up = await upload(jobId, cookie);
    expect(up.status).toBe(200);
    expect(await up.text()).toBe('RESULT_BYTES');

    // The job is now bound to the uploading user.
    const row = await env.DB.prepare('SELECT user_id FROM jobs WHERE job_id = ?')
      .bind(jobId)
      .first<{ user_id: string }>();
    expect(row?.user_id).toBe(user.id);

    // Owner's progress subscription passes format+ownership checks and the
    // request reaches the upstream AI server (interceptor below is consumed).
    mockAiProgress(jobId);
    const pr = await progress(jobId, cookie);
    expect(pr.status).toBe(200);
    expect(pr.headers.get('content-type')).toBe('text/event-stream');
    expect(await pr.text()).toContain('"type":"received"');
  });

  it('returns 404 when another user subscribes to an existing job', async () => {
    const { cookie: cookieA } = await registerAndLogin('jobs-victim@example.com');
    const { cookie: cookieB } = await registerAndLogin('jobs-attacker@example.com');
    const jobId = crypto.randomUUID();

    mockAiUpload(jobId);
    const up = await upload(jobId, cookieA);
    expect(up.status).toBe(200);

    // No progress interceptor is registered: user B's request must be
    // rejected at our layer without ever contacting the AI server.
    const pr = await progress(jobId, cookieB);
    expect(pr.status).toBe(404);
  });

  it('returns 409 when another user uploads to an already-claimed jobId', async () => {
    const { cookie: cookieA } = await registerAndLogin('jobs-dup-a@example.com');
    const { cookie: cookieB } = await registerAndLogin('jobs-dup-b@example.com');
    const jobId = crypto.randomUUID();

    mockAiUpload(jobId);
    expect((await upload(jobId, cookieA)).status).toBe(200);

    // Only user A's upload may reach the AI (single interceptor above).
    const dup = await upload(jobId, cookieB);
    expect(dup.status).toBe(409);
  });

  it('allows the owner to re-upload with the same jobId', async () => {
    const { cookie } = await registerAndLogin('jobs-reupload@example.com');
    const jobId = crypto.randomUUID();

    mockAiUpload(jobId);
    expect((await upload(jobId, cookie)).status).toBe(200);

    mockAiUpload(jobId, 'SECOND_RESULT');
    const again = await upload(jobId, cookie);
    expect(again.status).toBe(200);
    expect(await again.text()).toBe('SECOND_RESULT');
  });

  it('binds a progress-first subscription to the subscriber (SSE opens before upload)', async () => {
    // The frontend opens the progress EventSource before the upload XHR, so
    // the first authenticated toucher claims the job.
    const { user, cookie } = await registerAndLogin('jobs-sse-first@example.com');
    const { cookie: cookieB } = await registerAndLogin('jobs-sse-second@example.com');
    const jobId = crypto.randomUUID();

    mockAiProgress(jobId);
    const pr = await progress(jobId, cookie);
    expect(pr.status).toBe(200);
    await pr.text(); // drain the mocked SSE body

    const row = await env.DB.prepare('SELECT user_id FROM jobs WHERE job_id = ?')
      .bind(jobId)
      .first<{ user_id: string }>();
    expect(row?.user_id).toBe(user.id);

    // Another user now gets 409 on upload and 404 on progress for this job.
    expect((await upload(jobId, cookieB)).status).toBe(409);
    expect((await progress(jobId, cookieB)).status).toBe(404);
  });
});
