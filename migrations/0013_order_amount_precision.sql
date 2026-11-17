-- Preserve all historical order values while allowing order-wide discounts to cents.
ALTER TABLE orders
  ALTER COLUMN subtotal TYPE numeric(12,2) USING subtotal::numeric(12,2),
  ALTER COLUMN shipping_charge TYPE numeric(12,2) USING shipping_charge::numeric(12,2),
  ALTER COLUMN discount TYPE numeric(12,2) USING discount::numeric(12,2),
  ALTER COLUMN total TYPE numeric(12,2) USING total::numeric(12,2);
