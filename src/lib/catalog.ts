import { sql } from 'drizzle-orm';
import { products, categories } from '@/db/schema';

// Match product/category identity, never descriptions or the VPB business name.
export const publicCategory = sql`lower(${categories.slug}) !~ '(^|-)(kites?|patangs?)(-|$)' AND lower(${categories.name}) !~ '^(kites?|patangs?)$'`;
export const publicProduct = sql`${products.active} = true
  AND NOT (lower(${products.name}) ~ '\\m(kites?|patangs?)\\M' AND lower(${products.name}) !~ '\\m(manjha|saddi|charkhi)\\M')
  AND ${products.sku} NOT LIKE 'VPB-KT-%'
  AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = ${products.categoryId} AND
    (lower(c.slug) ~ '(^|-)(kites?|patangs?)(-|$)' OR lower(c.name) ~ '^(kites?|patangs?)$'))`;
export const reviewRating = sql<string>`coalesce((SELECT round(avg(r.rating), 2)::text FROM reviews r WHERE r.product_id = ${products.id} AND r.status = 'approved' AND NOT r.is_demo AND r.rating BETWEEN 1 AND 5), '0')`;
export const reviewCount = sql<number>`(SELECT count(*)::int FROM reviews r WHERE r.product_id = ${products.id} AND r.status = 'approved' AND NOT r.is_demo AND r.rating BETWEEN 1 AND 5)`;
