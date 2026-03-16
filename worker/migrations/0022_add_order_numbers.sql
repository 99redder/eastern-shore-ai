ALTER TABLE order_fulfillment ADD COLUMN order_number TEXT;
ALTER TABLE manual_survival_node_orders ADD COLUMN order_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_fulfillment_order_number ON order_fulfillment(order_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_survival_node_orders_order_number ON manual_survival_node_orders(order_number);
