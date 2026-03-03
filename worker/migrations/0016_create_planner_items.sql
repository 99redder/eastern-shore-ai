-- Shared planner items for Look Ahead app + dashboard integration
CREATE TABLE IF NOT EXISTS planner_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'chris',
  kind TEXT NOT NULL CHECK (kind IN ('task','appointment')) DEFAULT 'task',
  title TEXT NOT NULL,
  notes TEXT,
  scheduled_for TEXT,
  due_date TEXT,
  reminder_minutes INTEGER,
  status TEXT NOT NULL CHECK (status IN ('open','done','canceled')) DEFAULT 'open',
  priority INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_items_user_status_due
  ON planner_items(user_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_planner_items_user_scheduled
  ON planner_items(user_id, scheduled_for);
