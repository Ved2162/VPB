-- Additive only: all Razorpay columns, order IDs and invoice records survive.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_key uuid UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payu_txn_id varchar(25) UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payu_payment_id varchar(80) UNIQUE;
CREATE TABLE IF NOT EXISTS payu_attempts (
  txn_id varchar(25) PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  environment varchar(12) NOT NULL CHECK (environment IN ('test', 'production')),
  merchant_key text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  firstname text NOT NULL,
  email text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed', 'paid')),
  payment_id varchar(80) UNIQUE,
  created_at timestamp NOT NULL DEFAULT now(),
  verified_at timestamp
);
CREATE INDEX IF NOT EXISTS payu_attempts_order_idx ON payu_attempts(order_id);
-- Match privileges of the existing application table without assuming role names.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT grantee FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='orders' AND privilege_type='UPDATE'
      AND grantee <> 'PUBLIC'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON payu_attempts TO %I', r.grantee);
  END LOOP;
END $$;
