CREATE TABLE IF NOT EXISTS order_fulfillment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL UNIQUE,
  stripe_session_id TEXT,
  fulfillment_status TEXT NOT NULL DEFAULT 'new' CHECK (fulfillment_status IN ('new','acknowledged','shipped')),
  tracking_number TEXT,
  tracking_url TEXT,
  internal_notes TEXT,
  ack_email_sent_at TEXT,
  ack_email_subject TEXT,
  ack_email_body TEXT,
  shipping_email_sent_at TEXT,
  shipping_email_subject TEXT,
  shipping_email_body TEXT,
  shipped_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_fulfillment_status ON order_fulfillment(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_order_fulfillment_stripe_session_id ON order_fulfillment(stripe_session_id);
