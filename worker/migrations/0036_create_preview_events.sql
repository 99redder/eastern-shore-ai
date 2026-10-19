-- Visits and "call me" / "not for me" responses from the campaign preview sites.
CREATE TABLE IF NOT EXISTS preview_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,            -- visit | interested | not_interested
  ref TEXT,
  ip_hash TEXT,
  ua TEXT,
  city TEXT,
  region TEXT,
  name TEXT,
  phone TEXT,
  email TEXT,
  call_at TEXT,                  -- UTC ISO
  call_at_label TEXT,            -- e.g. "Tuesday, October 20 at 10:00 AM"
  method TEXT,                   -- call | text
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_preview_events_slug ON preview_events(slug, kind, created_at);
CREATE INDEX IF NOT EXISTS idx_preview_events_hash ON preview_events(ip_hash, created_at);
