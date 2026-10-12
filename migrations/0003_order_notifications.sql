CREATE TABLE order_notifications (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  status varchar(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','accepted','retry','failed','unknown','skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  accepted_at timestamptz,
  provider_request_id varchar(200),
  error_code varchar(80),
  resolved_by uuid REFERENCES users(id),
  resolution varchar(40),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_notifications_due_idx ON order_notifications(status, next_attempt_at);
-- Existing production runtime uses this restricted role; fresh/test databases may not.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vpb_app') THEN
    GRANT SELECT, INSERT, UPDATE ON order_notifications TO vpb_app;
  END IF;
END $$;
-- No historical backfill: deploying must not message previous customers.
