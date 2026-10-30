-- Ship-to name and address, one per line, shown in the acknowledgment and
-- shipping emails. Saved when one of those emails goes out, so a correction
-- carries to the next email; until then Stripe orders read it from the
-- Checkout Session, and manual orders have it typed into the email dialog.
ALTER TABLE order_fulfillment ADD COLUMN ship_to TEXT;
ALTER TABLE manual_survival_node_orders ADD COLUMN ship_to TEXT;
