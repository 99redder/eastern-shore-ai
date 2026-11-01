-- Visits to public pages we want a daily count for (node.html for now).
-- One row per page load (bots skipped, Chris's own browser skipped). No IP is stored, only a salted hash.
CREATE TABLE IF NOT EXISTS page_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,            -- e.g. node
  day TEXT NOT NULL,             -- Eastern date YYYY-MM-DD
  source TEXT,                   -- google, google ads, reddit, facebook, bing, direct, other site, ...
  ref_host TEXT,                 -- referrer host when it isn't us
  device TEXT,                   -- phone | tablet | computer
  city TEXT,
  region TEXT,
  country TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_page_visits_day ON page_visits(page, day);
