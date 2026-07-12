import { describe, expect, it } from 'vitest';
import { parseUsageHeader, parseUsageInfo } from '../src/lib/usageHeader';

// ── issue #34 review follow-up ──────────────────────────────────────────────
// The X-Usage header parse (and the /api/images/usage refetch) used to accept
// any payload that merely had the right *keys* present ('used' in x &&
// 'limit' in x, or 'month' in x). That let malformed values — missing
// `month`, non-numeric `used`/`limit`, or invalid JSON — reach setUsage().
// Both helpers now validate the FULL UsageInfo shape via usageInfoSchema and
// return undefined on any mismatch, so the existing fallback (keep last-known
// usage + background refetch) kicks in instead.

describe('parseUsageHeader', () => {
  it('parses a valid header into a UsageInfo object', () => {
    const raw = JSON.stringify({ used: 3, limit: 50, month: '2026-07' });
    expect(parseUsageHeader(raw)).toEqual({ used: 3, limit: 50, month: '2026-07' });
  });

  it('returns undefined when month is missing', () => {
    const raw = JSON.stringify({ used: 3, limit: 50 });
    expect(parseUsageHeader(raw)).toBeUndefined();
  });

  it('returns undefined when used is non-numeric', () => {
    const raw = JSON.stringify({ used: '3', limit: 50, month: '2026-07' });
    expect(parseUsageHeader(raw)).toBeUndefined();
  });

  it('returns undefined for invalid JSON', () => {
    expect(parseUsageHeader('{not json')).toBeUndefined();
  });

  it('returns undefined when the header is null (absent)', () => {
    expect(parseUsageHeader(null)).toBeUndefined();
  });

  it('still parses when an extra unknown field is present (schema is non-strict: extra keys are stripped, not rejected)', () => {
    const raw = JSON.stringify({ used: 3, limit: 50, month: '2026-07', plan: 'free' });
    expect(parseUsageHeader(raw)).toEqual({ used: 3, limit: 50, month: '2026-07' });
  });
});

describe('parseUsageInfo', () => {
  it('parses a valid value into a UsageInfo object', () => {
    const value = { used: 10, limit: 1000, month: '2026-07' };
    expect(parseUsageInfo(value)).toEqual(value);
  });

  it('returns undefined when month is missing', () => {
    expect(parseUsageInfo({ used: 10, limit: 1000 })).toBeUndefined();
  });

  it('returns undefined when limit is non-numeric', () => {
    expect(parseUsageInfo({ used: 10, limit: '1000', month: '2026-07' })).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(parseUsageInfo(null)).toBeUndefined();
  });

  it('still parses when an extra unknown field is present (schema is non-strict: extra keys are stripped, not rejected)', () => {
    const value = { used: 10, limit: 1000, month: '2026-07', extra: true };
    expect(parseUsageInfo(value)).toEqual({ used: 10, limit: 1000, month: '2026-07' });
  });
});
