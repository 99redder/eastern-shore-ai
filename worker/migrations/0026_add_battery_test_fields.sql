ALTER TABLE manual_survival_node_orders ADD COLUMN battery_test_note TEXT;
ALTER TABLE manual_survival_node_orders ADD COLUMN battery_test_image_key TEXT;
ALTER TABLE order_fulfillment ADD COLUMN battery_test_note TEXT;
ALTER TABLE order_fulfillment ADD COLUMN battery_test_image_key TEXT;
