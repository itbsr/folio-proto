import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

// Migration 0003 adds idx_usage_logs_user_id so the history query
// (WHERE user_id = ? ORDER BY id DESC LIMIT 20) no longer full-scans.
describe('usage_logs user_id index', () => {
  it('exists in sqlite_master after migrations', async () => {
    const row = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'usage_logs' AND name = 'idx_usage_logs_user_id'",
    ).first<{ name: string }>();
    expect(row?.name).toBe('idx_usage_logs_user_id');
  });

  it('is used by the history query plan', async () => {
    const { results } = await env.DB.prepare(
      'EXPLAIN QUERY PLAN SELECT id, status, error_msg, created_at FROM usage_logs WHERE user_id = ? ORDER BY id DESC LIMIT 20',
    )
      .bind('some-user-id')
      .all();
    const plan = results.map((row) => JSON.stringify(row)).join('\n');
    expect(plan).toContain('idx_usage_logs_user_id');
    expect(plan).not.toContain('SCAN usage_logs');
  });
});
