-- Year-end count of Survival Node parts (and finished nodes) still on hand. Parts are booked as
-- expenses when bought; the count moves the unsold ones out of that year's expenses and into the
-- next year (journal entries with source_type 'inventory_count', source_id = year). One row per
-- year: `year` is the year the count closes (on hand at the end of Dec 31 of that year).
CREATE TABLE IF NOT EXISTS inventory_counts (
  year INTEGER PRIMARY KEY,
  count_date TEXT NOT NULL,      -- day the count was taken, YYYY-MM-DD
  lines_json TEXT NOT NULL,      -- [{ item, qty, unitCents, valueCents }]
  total_cents INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
