-- Family copies: each recipient's name and U.S. address, entered on the keepsakes page before checkout
-- (Stripe Checkout collects only one shipping address). JSON list of {name, line1, line2, city, state, zip}.
-- Orders are now saved as 'pending' when checkout opens and become 'paid' from the webhook.
ALTER TABLE film_keepsake_orders ADD COLUMN recipients TEXT;
