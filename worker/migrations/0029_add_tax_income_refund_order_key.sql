ALTER TABLE tax_income ADD COLUMN refund_order_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_income_refund_order_key
ON tax_income(refund_order_key)
WHERE refund_order_key IS NOT NULL;
