import { usageInfoSchema } from '@my-app/shared';
import type { UsageInfo } from '@my-app/shared';

// ── issue #34 review follow-up ──────────────────────────────────────────────
// The `X-Usage` response header (and the `GET /api/images/usage` refetch body)
// were previously accepted as soon as a couple of expected keys were present
// (`'used' in parsed && 'limit' in parsed`, or `'month' in d`). That lets a
// malformed payload — missing `month`, or a non-numeric `used`/`limit` —
// through to `setUsage()`. Both call sites now validate against the FULL
// `UsageInfo` shape via `usageInfoSchema`; anything that fails validation is
// treated as `undefined`/absent so callers fall back to the last-known usage
// plus a background refetch, per the existing issue #34 remediation.

/**
 * Parses the `X-Usage` response header into a validated `UsageInfo`.
 * Returns `undefined` when the header is missing, is not valid JSON, or does
 * not match the full `UsageInfo` schema (`used`/`limit`/`month`).
 */
export function parseUsageHeader(raw: string | null): UsageInfo | undefined {
  if (raw === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return parseUsageInfo(parsed);
}

/**
 * Validates an arbitrary value (e.g. a parsed JSON response body) against the
 * full `UsageInfo` schema. Returns `undefined` on any mismatch.
 */
export function parseUsageInfo(value: unknown): UsageInfo | undefined {
  const result = usageInfoSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
