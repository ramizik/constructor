-- Butterbase Postgres schema for Constructor.
-- The graph itself lives in Neo4j (Logan's track); Postgres only holds job/task
-- state so the UI can show live status via Butterbase Realtime.
--
-- Apply with: butterbase schema apply ./backend/schema.sql
-- Then enable realtime: butterbase realtime enable jobs

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('scout', 'analyze', 'plan')),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'running', 'done', 'error')),
  params      JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_ref  TEXT,
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs (created_at DESC);
