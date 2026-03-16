ALTER TABLE order_fulfillment ADD COLUMN delivered_email_sent_at TEXT;
ALTER TABLE order_fulfillment ADD COLUMN delivered_email_subject TEXT;
ALTER TABLE order_fulfillment ADD COLUMN delivered_email_body TEXT;
ALTER TABLE manual_survival_node_orders ADD COLUMN delivered_email_sent_at TEXT;
ALTER TABLE manual_survival_node_orders ADD COLUMN delivered_email_subject TEXT;
ALTER TABLE manual_survival_node_orders ADD COLUMN delivered_email_body TEXT;
