-- Typing indicator state for chat sessions
-- Each active typer stores their state here; rows expire by timestamp check
CREATE TABLE IF NOT EXISTS chat_typing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  role TEXT NOT NULL,           -- 'user' or 'staff'
  sender_name TEXT,             -- Display name of typer
  updated_at TEXT NOT NULL,     -- Timestamp for expiry check (stale after ~5s)
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id),
  UNIQUE(session_id, role)      -- Only one typing state per role per session
);

-- Index for quick lookup by session
CREATE INDEX IF NOT EXISTS idx_chat_typing_session ON chat_typing(session_id);
