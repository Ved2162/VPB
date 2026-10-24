-- Existing reviews are preserved and queued for authenticity/moderation review.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS language varchar(20) NOT NULL DEFAULT 'en';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'pending';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS reviews_public_product_idx ON reviews(product_id, status, is_demo);
