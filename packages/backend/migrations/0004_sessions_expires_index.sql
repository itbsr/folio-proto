-- Sessions are cleaned up opportunistically on every successful login
-- (DELETE FROM sessions WHERE expires_at <= datetime('now')). Index
-- expires_at so that global delete never has to scan the whole table,
-- including the first run against an already-bloated production table.
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
