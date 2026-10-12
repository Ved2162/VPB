CREATE TABLE IF NOT EXISTS invoice_counters (
  financial_year varchar(7) PRIMARY KEY,
  last_number integer NOT NULL CHECK (last_number > 0)
);
CREATE TABLE IF NOT EXISTS order_invoices (
  order_id uuid PRIMARY KEY REFERENCES orders(id),
  invoice_number varchar(30) UNIQUE NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS invoice_cancellations (
  order_id uuid PRIMARY KEY REFERENCES order_invoices(order_id),
  actor_id uuid NOT NULL REFERENCES users(id),
  reason varchar(500) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Snapshots and cancellation records are append-only for the application role.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vpb_app') THEN
    GRANT SELECT, INSERT ON order_invoices, invoice_cancellations TO vpb_app;
    GRANT SELECT, INSERT, UPDATE ON invoice_counters TO vpb_app;
  END IF;
END $$;
