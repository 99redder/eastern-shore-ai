-- One-tap Survival Node reviews (src/reviews.js). A row is made when the review
-- request email is built for an order (status 'invited', no rating yet); tapping a
-- star in the email sets the rating ('pending'); Red approves it in admin
-- ('approved') before it can show on node.html. 'hidden' = spam or abuse only.
CREATE TABLE IF NOT EXISTS product_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  order_key TEXT NOT NULL UNIQUE,
  order_number TEXT,
  customer_name TEXT,
  customer_email TEXT,
  rating INTEGER,
  comment TEXT,
  name_choice TEXT NOT NULL DEFAULT 'initial',
  status TEXT NOT NULL DEFAULT 'invited',
  user_agent TEXT,
  rated_at TEXT,
  approved_at TEXT,
  alerted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_status ON product_reviews(status);
