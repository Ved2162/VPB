-- New rows default to PayU. Existing provider labels and transaction IDs stay intact.
ALTER TABLE orders ALTER COLUMN payment_method SET DEFAULT 'payu';
