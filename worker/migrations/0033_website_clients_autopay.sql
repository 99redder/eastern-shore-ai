-- Website Care Plan automatic renewal (yearly Stripe subscription).
ALTER TABLE website_clients ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE website_clients ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE website_clients ADD COLUMN subscription_status TEXT;          -- Stripe status: trialing | active | past_due | unpaid | canceled ...
ALTER TABLE website_clients ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;
ALTER TABLE website_clients ADD COLUMN last_payment_failed_at TEXT;
ALTER TABLE website_clients ADD COLUMN renewal_reminder_sent_for TEXT;    -- renewal date the reminder email covered
CREATE INDEX IF NOT EXISTS ix_website_clients_subscription ON website_clients(stripe_subscription_id);
