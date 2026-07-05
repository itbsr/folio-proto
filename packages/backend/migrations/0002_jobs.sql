-- Design A jobs: binds a client-generated jobId to the user who first used it,
-- so /images/progress can refuse subscriptions from non-owners (issue #37).
CREATE TABLE IF NOT EXISTS jobs (
  job_id     TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
