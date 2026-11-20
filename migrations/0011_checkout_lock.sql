-- Add checkout lock tracking to orders table
-- This ensures checkout locking persists across page refreshes and browser sessions

ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_locked_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient lookup of locked checkouts
CREATE INDEX IF NOT EXISTS orders_checkout_locked_idx ON orders(user_id, checkout_locked_at) WHERE checkout_locked_at IS NOT NULL AND payment_status = 'pending';

-- Comments
COMMENT ON COLUMN orders.checkout_locked_at IS 'Timestamp when customer was redirected to PayU. Prevents concurrent payment attempts. Cleared when payment succeeds, fails, or customer explicitly cancels.';
