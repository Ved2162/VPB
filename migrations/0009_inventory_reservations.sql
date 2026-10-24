-- New checkouts only; historical inventory and orders are not modified.
CREATE TABLE inventory_reservations (
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
CREATE INDEX inventory_reservations_product_idx ON inventory_reservations(product_id, expires_at);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vpb_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_reservations TO vpb_app;
  END IF;
END $$;
