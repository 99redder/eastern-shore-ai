-- Chat sessions table for human-handoff support
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT NOT NULL UNIQUE,
  page TEXT,
  page_url TEXT,
  customer_name TEXT,
  customer_email TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- active, closed
  escalated_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for listing open sessions
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);

-- Index for session lookup by token
CREATE INDEX IF NOT EXISTS idx_chat_sessions_token ON chat_sessions(session_token);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  role TEXT NOT NULL,  -- user, assistant, staff, system
  content TEXT NOT NULL,
  sender_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);

-- Index for fetching messages by session
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
