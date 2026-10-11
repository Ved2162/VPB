CREATE TABLE delivery_staff (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  all_orders boolean NOT NULL DEFAULT false
);
CREATE TABLE delivery_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(80) NOT NULL UNIQUE,
  tracking_url text NOT NULL, active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shipments (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES delivery_providers(id), courier_name varchar(80),
  tracking_url text NOT NULL DEFAULT '', docket_number varchar(80) NOT NULL DEFAULT '',
  status varchar(30) NOT NULL DEFAULT 'NOT_ASSIGNED' CHECK (status IN
    ('NOT_ASSIGNED','ASSIGNED','PICKUP_PENDING','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','DELIVERY_FAILED','RETURN_TO_ORIGIN','CANCELLED')),
  internal_notes text NOT NULL DEFAULT '', assigned_to uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipments_assigned_idx ON shipments(assigned_to);
CREATE INDEX shipments_status_idx ON shipments(status);
CREATE INDEX shipments_provider_idx ON shipments(provider_id);
CREATE INDEX orders_delivery_date_idx ON orders(created_at DESC, id);
CREATE TABLE shipment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL, actor_name varchar(120) NOT NULL,
  before jsonb NOT NULL, after jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipment_history_order_idx ON shipment_status_history(order_id, created_at);
CREATE TABLE delivery_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  resource varchar(30) NOT NULL, resource_id uuid NOT NULL, changes jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE delivery_rate_limits (
  key varchar(100) PRIMARY KEY, count integer NOT NULL DEFAULT 1, reset_at timestamptz NOT NULL
);
-- Preserve existing manual courier details without guessing shipping progress.
INSERT INTO shipments (order_id, courier_name, docket_number)
SELECT id, courier, coalesce(tracking_number, '') FROM orders
WHERE coalesce(courier, '') <> '' OR coalesce(tracking_number, '') <> '';
