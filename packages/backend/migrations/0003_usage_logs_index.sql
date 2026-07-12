-- usage_logs is read as `WHERE user_id = ? ORDER BY id DESC LIMIT 20`
-- (GET /api/images/history). Without an index this is a full table scan.
-- The composite (user_id, id DESC) index serves both the filter and the
-- ordering, so the LIMIT 20 stops after reading 20 index entries.
CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id, id DESC);
