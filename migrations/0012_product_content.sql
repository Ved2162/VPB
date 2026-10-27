-- Catalog-only corrections verified against saved product descriptions on 2026-10-27.
-- No order/invoice snapshots, IDs, slugs, prices, stock, or permissions are changed.
-- Exact identity/name guards protect unrelated products and later administrator edits.
WITH verified(id, old_name, name, variant, base, coating, lengths) AS (VALUES
 ('cbae3d6b-57dc-4e9f-9dba-7d4cbcb1824e'::uuid, 'VAYUSHASTRA Sankal 8 (4 REEL)', 'VAYUSHASTRA Sankal 8', '4 REEL', 'Original Sankal 8 Cotton Thread', '4-layer coating (Heavy Sharp & Finish)', '4 Reels (4,000 meters)'),
 ('98e97c0d-2094-4d6c-82b5-76811ae8b014'::uuid, 'VAYUSHASTRA Sankal 8 (3 REEL)', 'VAYUSHASTRA Sankal 8', '3 REEL', 'Original Sankal 8 Cotton Thread', '4-layer coating (Heavy Sharp & Finish)', '3 Reels (3,000 Meters)'),
 ('8aeea675-fee9-4a8d-8c45-44d246f474b5'::uuid, 'VAYUSHASTRA PANDA 5 (3 REEL)', 'VAYUSHASTRA PANDA 5', '3 REEL', 'Original Panda 5 Cotton Thread', '4-layer coating (Heavy Sharp & Finish)', '3 Reels (3,000 Meters)'),
 ('139fc82e-1b64-4854-8cad-35b49516c9e8'::uuid, 'THE ROCK BREAKER, Sankal 8  (4 REEL)', 'THE ROCK BREAKER', 'Sankal 8, 4 REEL', 'Original Sankal 8 Cotton Thread', '4-layer coating (Heavy Sharp & Finish)', '4 Reels (4,000 meters)'),
 ('7d92321e-2080-4940-b09c-45f8ecab3d76'::uuid, 'THE ROCK BREAKER, Sankal 8 (2 REEL)', 'THE ROCK BREAKER', 'Sankal 8, 2 REEL', 'Original SAKD 8 Cotton Thread', '4-layer coating (Heavy Sharp & Finish)', '2 Reels (2,000 meters)'),
 ('84a0088c-0e2f-4aaf-b0ec-f9982ad7e655'::uuid, 'THE ROCK BREAKER, PANDA 5 (4 REEL)', 'THE ROCK BREAKER', 'PANDA 5, 4 REEL', 'Original Panda 5 Cotton Thread', '4 Coating (Heavy Sharp & Finish)', '4 Reels (4,000 meters)')
)
UPDATE products p SET name = v.name || ' (' || v.variant || ')', reel_count = v.variant, length = v.lengths,
  specs = jsonb_build_array(jsonb_build_object('label', 'Base', 'value', v.base),
    jsonb_build_object('label', 'Coating', 'value', '4-layer coating (Heavy Sharp & Finish)'),
    jsonb_build_object('label', 'Lengths', 'value', v.lengths)), updated_at = now()
FROM verified v WHERE p.id = v.id AND p.name = v.old_name AND p.specs = '{}'::jsonb
  AND position(v.base IN p.description) > 0 AND position(v.coating IN p.description) > 0
  AND position(v.lengths IN p.description) > 0;

UPDATE categories SET description = 'Limited special editions from VPB.'
WHERE slug = 'special-manjha' AND description = 'Limited special editions — Black Panther, Adnan Special and more.';
UPDATE banners SET subtitle = 'VAYUSHASTRA Sankal 8 • THE ROCK BREAKER • VAYUSHASTRA PANDA 5'
WHERE subtitle = 'Adnan • Black Panther • Nawab — tournament reels restocked';
