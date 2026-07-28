import { describe, expect, it } from 'vitest';
import { request } from './helpers';

// CORS allowlist (issue #30).
//
// The test value of CORS_ORIGINS is injected in vitest.config.ts:
//   "https://app.test,https://*.example.pages.dev"
//
// With credentials: true the backend must never reflect arbitrary origins;
// a disallowed (or absent) Origin gets NO Access-Control-Allow-Origin at all.

const ALLOWED = 'https://app.test';
const EVIL = 'https://evil.example';

function get(path: string, origin?: string): Promise<Response> {
  return request(path, {
    headers: origin ? { Origin: origin } : {},
  });
}

function preflight(path: string, origin: string): Promise<Response> {
  return request(path, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type',
    },
  });
}

describe('CORS allowlist', () => {
  it('echoes an allowlisted origin exactly (with credentials)', async () => {
    const res = await get('/auth/me', ALLOWED);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Vary')).toContain('Origin');
  });

  it('sends no Access-Control-Allow-Origin for a disallowed origin', async () => {
    const res = await get('/auth/me', EVIL);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('sends no Access-Control-Allow-Origin when Origin is absent', async () => {
    const res = await get('/auth/me');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  describe('wildcard suffix entries (https://*.example.pages.dev)', () => {
    it('matches a subdomain of the wildcard entry', async () => {
      const origin = 'https://abc123.example.pages.dev';
      const res = await get('/auth/me', origin);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    });

    it('does NOT match a lookalike domain (no substring matching)', async () => {
      const res = await get('/auth/me', 'https://evilexample.pages.dev');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('does NOT match when the suffix is embedded in another domain', async () => {
      const res = await get('/auth/me', 'https://x.example.pages.dev.evil.com');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('does NOT match the bare apex (wildcard requires a subdomain)', async () => {
      const res = await get('/auth/me', 'https://example.pages.dev');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('does NOT match a different scheme (exact-scheme check)', async () => {
      const res = await get('/auth/me', 'http://abc123.example.pages.dev');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  describe('preflight (OPTIONS)', () => {
    it('answers preflight for an allowed origin', async () => {
      const res = await preflight('/auth/login', ALLOWED);
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });

    it('answers preflight for a disallowed origin without Allow-Origin', async () => {
      const res = await preflight('/auth/login', EVIL);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });
});
