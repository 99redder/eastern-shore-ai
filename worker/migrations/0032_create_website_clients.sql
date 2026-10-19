-- Website Care Plan clients ($100/yr postcard campaign): agreement e-signature + yearly payments.
CREATE TABLE IF NOT EXISTS website_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  preview_url TEXT,
  domain_name TEXT,
  annual_price_cents INTEGER NOT NULL DEFAULT 10000,
  status TEXT NOT NULL DEFAULT 'prospect', -- prospect | link_sent | signed | active | past_due | canceled
  notes TEXT,
  agreement_token TEXT NOT NULL,
  link_sent_at TEXT,
  renewal_link_sent_at TEXT,
  signed_at TEXT,
  signer_name TEXT,
  signer_title TEXT,
  signer_email TEXT,
  signer_ip TEXT,
  signer_user_agent TEXT,
  agreement_version TEXT,
  agreement_hash TEXT,
  agreement_text TEXT,
  first_paid_at TEXT,
  last_paid_at TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  canceled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_website_clients_token ON website_clients(agreement_token);

CREATE TABLE IF NOT EXISTS website_client_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  stripe_session_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  amount_cents INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_website_client_payments_session ON website_client_payments(stripe_session_id);
CREATE INDEX IF NOT EXISTS ix_website_client_payments_client ON website_client_payments(client_id);
