-- Keepsakes bought straight from the keepsakes page (my-keepsakes.html) with Stripe Checkout.
CREATE TABLE IF NOT EXISTS film_keepsake_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  item TEXT NOT NULL,                 -- book | copies | picture | audiobook (FILM_KEEPSAKES)
  qty INTEGER NOT NULL DEFAULT 1,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  stripe_session_id TEXT NOT NULL UNIQUE,
  ship_to TEXT,
  status TEXT NOT NULL DEFAULT 'paid',  -- paid, in progress, shipped / delivered (set in admin later)
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_film_keepsake_orders_project ON film_keepsake_orders(project_id);
