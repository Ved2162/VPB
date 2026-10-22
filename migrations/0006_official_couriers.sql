-- Reuse the existing provider and shipment schema. Do not rewrite shipment history,
-- assignments, docket IDs, or legacy provider records.
INSERT INTO delivery_providers (name, tracking_url, active)
VALUES ('Shree Anjani', 'https://shreeanjani.co.in/tracking/', true),
       ('Shree Maruti', 'https://shreemaruti.com/track-shipment/', true)
ON CONFLICT (name) DO UPDATE SET tracking_url = EXCLUDED.tracking_url;
