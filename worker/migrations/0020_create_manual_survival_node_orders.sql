CREATE TABLE IF NOT EXISTS manual_survival_node_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  payment_date TEXT NOT NULL,
  payment_method TEXT,
  order_summary TEXT NOT NULL DEFAULT 'Survival Node',
  internal_notes TEXT,
  fulfillment_status TEXT NOT NULL DEFAULT 'new' CHECK (fulfillment_status IN ('new','acknowledged','shipped')),
  tracking_number TEXT,
  tracking_url TEXT,
  ack_email_sent_at TEXT,
  ack_email_subject TEXT,
  ack_email_body TEXT,
  shipping_email_sent_at TEXT,
  shipping_email_subject TEXT,
  shipping_email_body TEXT,
  shipped_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_manual_survival_node_orders_status ON manual_survival_node_orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_manual_survival_node_orders_payment_date ON manual_survival_node_orders(payment_date);
