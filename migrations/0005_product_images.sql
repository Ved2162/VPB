CREATE TABLE IF NOT EXISTS product_images (
  id text PRIMARY KEY,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  data text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vpb_app') THEN
    GRANT SELECT, INSERT ON product_images TO vpb_app;
  END IF;
END $$;
