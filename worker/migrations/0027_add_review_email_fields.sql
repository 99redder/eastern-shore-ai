ALTER TABLE order_fulfillment ADD COLUMN review_email_sent_at TEXT;
ALTER TABLE order_fulfillment ADD COLUMN review_email_subject TEXT;
ALTER TABLE order_fulfillment ADD COLUMN review_email_body TEXT;
ALTER TABLE manual_survival_node_orders ADD COLUMN review_email_sent_at TEXT;
ALTER TABLE manual_survival_node_orders ADD COLUMN review_email_subject TEXT;
ALTER TABLE manual_survival_node_orders ADD COLUMN review_email_body TEXT;
