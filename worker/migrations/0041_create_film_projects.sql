-- Folder to Film story-film projects (src/folder-to-film.js).
-- A row is created when the customer starts checkout (status pending_payment);
-- payment moves it to collecting and opens the customer's dashboard
-- (my-film.html?t=TOKEN). Uploaded files live in the FILMS R2
-- bucket under projects/<id>/.
CREATE TABLE IF NOT EXISTS film_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  project_name TEXT,
  about TEXT,
  occasion TEXT,
  needed_by TEXT,
  links TEXT,
  answers_json TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  billing_state TEXT,
  amount_cents INTEGER,
  tax_cents INTEGER,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  paid_at TEXT,
  production_started_at TEXT,
  demo_due_date TEXT,
  -- When staff expect the finished film; set in admin, shown on the dashboard and in Ask K status emails.
  estimated_done_date TEXT,
  demo_url TEXT,
  -- Videos uploaded from admin into R2 (deliverables/<id>/...); they take precedence over demo_url/final_url.
  demo_key TEXT,
  final_key TEXT,
  -- Share page film.html?s=SHARE_TOKEN plays/downloads the final film (separate from the dashboard link).
  share_token TEXT,
  final_url TEXT,
  demo_sent_at TEXT,
  final_sent_at TEXT,
  feedback TEXT,
  feedback_at TEXT,
  approved_at TEXT,
  -- Rounds of changes used (2 included); a round = changes sent on a fresh demo.
  change_rounds INTEGER NOT NULL DEFAULT 0,
  internal_notes TEXT,
  -- "Notes for Chris" on the dashboard (any time after paying).
  customer_notes TEXT,
  customer_notes_at TEXT,
  -- Project chat: a chat_sessions row, so staff answer from support-chat.html.
  chat_session_id INTEGER,
  customer_seen_at TEXT,
  last_reply_email_at TEXT,
  last_staff_alert_at TEXT,
  -- Folder to Film terms the customer agreed to before checkout (folder-to-film-terms.html).
  terms_version TEXT,
  terms_accepted_at TEXT,
  -- Uploads are deleted 90 days after final_sent_at; the project 365 days after (purgeOldFilms).
  uploads_purged_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_film_projects_session ON film_projects(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_film_projects_status ON film_projects(status);

CREATE TABLE IF NOT EXISTS film_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  upload_id TEXT,
  filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploading',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_film_uploads_project ON film_uploads(project_id, status);

-- Every email sent to a customer about their film (the BCC copy is the full record).
CREATE TABLE IF NOT EXISTS film_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT,
  to_email TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_film_emails_project ON film_emails(project_id);

-- Dashboard access (src/folder-to-film.js). The link alone isn't enough: a browser
-- must be trusted. The browser that just paid is trusted automatically; any other
-- needs a 6-digit code emailed to the buyer or to a person the buyer added.
CREATE TABLE IF NOT EXISTS film_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  email TEXT NOT NULL,          -- lowercase
  name TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, email)
);

CREATE TABLE IF NOT EXISTS film_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  device_hash TEXT NOT NULL UNIQUE,   -- SHA-256 of the token kept in the browser
  email TEXT NOT NULL,                -- who verified (the buyer or a person they added)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_film_devices_project ON film_devices(project_id);

CREATE TABLE IF NOT EXISTS film_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_film_codes_project ON film_codes(project_id, email);
