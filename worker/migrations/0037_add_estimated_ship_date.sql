-- Estimated ship date (YYYY-MM-DD), set in admin with the acknowledgment
-- email or the Ship Date button. Ask K's order-status emails read it.
ALTER TABLE order_fulfillment ADD COLUMN estimated_ship_date TEXT;
ALTER TABLE manual_survival_node_orders ADD COLUMN estimated_ship_date TEXT;
