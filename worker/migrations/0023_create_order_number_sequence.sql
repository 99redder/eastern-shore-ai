CREATE TABLE IF NOT EXISTS order_number_sequence (
  seq_key TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO order_number_sequence (seq_key, last_value)
SELECT 'survival_node_orders',
       MAX(COALESCE(CAST(order_number AS INTEGER), 0))
FROM (
  SELECT order_number FROM order_fulfillment
  UNION ALL
  SELECT order_number FROM manual_survival_node_orders
)
WHERE NOT EXISTS (SELECT 1 FROM order_number_sequence WHERE seq_key = 'survival_node_orders');
