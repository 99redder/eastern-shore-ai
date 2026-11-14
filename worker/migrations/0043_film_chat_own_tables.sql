-- The Folder to Film project chat gets its own tables. It used to borrow the Survival Node
-- support chat (chat_sessions / chat_messages), so film messages showed up in support-chat.html
-- and sent its push alerts. Now a customer message emails staff, and staff reply from admin or
-- the staff view of the dashboard.
CREATE TABLE IF NOT EXISTS film_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  role TEXT NOT NULL,              -- 'user' (the buyer or someone they added) or 'staff'
  sender_name TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL         -- ISO time (UTC)
);
CREATE INDEX IF NOT EXISTS idx_film_messages_project ON film_messages(project_id, id);

CREATE TABLE IF NOT EXISTS film_typing (
  project_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  sender_name TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, role)
);

-- When staff last had the chat open in the staff view (no email while they're watching).
ALTER TABLE film_projects ADD COLUMN staff_seen_at TEXT;

-- Move existing film chat messages out of the support chat, then remove the borrowed sessions.
INSERT INTO film_messages (project_id, role, sender_name, content, created_at)
  SELECT p.id, m.role, m.sender_name, m.content, m.created_at
  FROM chat_messages m JOIN film_projects p ON p.chat_session_id = m.session_id
  WHERE m.role IN ('user', 'staff')
  ORDER BY m.id;
DELETE FROM chat_typing WHERE session_id IN (SELECT chat_session_id FROM film_projects WHERE chat_session_id IS NOT NULL);
DELETE FROM support_push_state WHERE session_id IN (SELECT chat_session_id FROM film_projects WHERE chat_session_id IS NOT NULL);
DELETE FROM chat_messages WHERE session_id IN (SELECT chat_session_id FROM film_projects WHERE chat_session_id IS NOT NULL);
DELETE FROM chat_sessions WHERE id IN (SELECT chat_session_id FROM film_projects WHERE chat_session_id IS NOT NULL);
UPDATE film_projects SET chat_session_id = NULL WHERE chat_session_id IS NOT NULL;
