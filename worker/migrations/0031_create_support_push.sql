-- Web Push subscriptions for the Support Chat operator PWA.
-- The endpoint is a capability URL, so this table is only accessed by admin
-- routes and is never included in the session/list responses.
CREATE TABLE IF NOT EXISTS support_push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time TEXT,
  label TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_success_at INTEGER,
  last_failure_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_support_push_subscriptions_active
  ON support_push_subscriptions(active);

CREATE TABLE IF NOT EXISTS support_push_state (
  session_id INTEGER PRIMARY KEY,
  acknowledged_at INTEGER,
  last_sent_at INTEGER,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

