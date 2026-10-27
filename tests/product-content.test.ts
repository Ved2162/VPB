import { afterAll, beforeAll, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createTestDatabase } from './database';
import { products, orders, orderItems } from '../src/db/schema';
import { productDisplayName, productSpecificationRows, validateSpecifications } from '../src/lib/product-specs';

let database: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => { database = await createTestDatabase(); });
afterAll(async () => { await database.pg.close(); });

test('verified catalog migration is repeatable, preserves snapshots and ignores unrelated or edited products', async () => {
  const [product] = await database.db.insert(products).values({
    id: 'cbae3d6b-57dc-4e9f-9dba-7d4cbcb1824e', name: 'VAYUSHASTRA Sankal 8 (4 REEL)', slug: 'existing-url', sku: 'EXISTING', price: 2800, stockQuantity: 42,
    description: 'Base: Original Sankal 8 Cotton Thread\nCoating: 4-layer coating (Heavy Sharp & Finish)\n4 Reels (4,000 meters)',
  }).returning();
  await database.db.insert(products).values({ id: '98e97c0d-2094-4d6c-82b5-76811ae8b014', name: 'VAYUSHASTRA Sankal 8 (3 REEL)', slug: 'edited-url', sku: 'EDITED', price: 100, specs: { Base: 'Admin edited' } });
  const [order] = await database.db.insert(orders).values({ orderNumber: 'OLD-SNAPSHOT', subtotal: 2800, total: 2800 }).returning();
  await database.db.insert(orderItems).values({ orderId: order.id, productId: product.id, productName: 'Historical product description', price: 2800, quantity: 1 });
  const sql = await readFile(new URL('../migrations/0012_product_content.sql', import.meta.url), 'utf8');
  await database.pg.exec(sql);
  const first = await database.db.select().from(products);
  expect(first.find(p => p.id === product.id)).toMatchObject({ id: product.id, slug: 'existing-url', price: 2800, stockQuantity: 42, reelCount: '4 REEL', length: '4 Reels (4,000 meters)', specs: [
    { label: 'Base', value: 'Original Sankal 8 Cotton Thread' }, { label: 'Coating', value: '4-layer coating (Heavy Sharp & Finish)' }, { label: 'Lengths', value: '4 Reels (4,000 meters)' },
  ] });
  expect(first.find(p => p.sku === 'EDITED')?.specs).toEqual({ Base: 'Admin edited' });
  await database.pg.exec(sql);
  expect(await database.db.select().from(products)).toEqual(first);
  expect((await database.db.select().from(orderItems))[0].productName).toBe('Historical product description');
});

test('legacy, empty and ordered specs render safely; variant is included only once', () => {
  expect(validateSpecifications([{ label: 'demo 1', value: 'testing' }, { label: '', value: '' }, { label: '  ', value: '  ' }])).toEqual([{ label: 'demo 1', value: 'testing' }]);
  expect(validateSpecifications([{ label: '', value: '' }])).toEqual([]);
  expect(productSpecificationRows({ specs: { Base: 'Cotton', Empty: '' }, length: '4000m' })).toEqual([{ label: 'Base', value: 'Cotton' }, { label: 'Lengths', value: '4000m' }]);
  expect(productSpecificationRows({ specs: [{ label: 'Lengths', value: '2 Reels' }], length: '4000m' })).toEqual([{ label: 'Lengths', value: '2 Reels' }]);
  expect(productSpecificationRows({ specs: null })).toEqual([]);
  expect(productDisplayName({ name: 'THE ROCK BREAKER', reelCount: 'Sankal 8, 4 REEL' })).toBe('THE ROCK BREAKER (Sankal 8, 4 REEL)');
  expect(productDisplayName({ name: 'VAYUSHASTRA Sankal 8 (4 REEL)', reelCount: '4 REEL' })).toBe('VAYUSHASTRA Sankal 8 (4 REEL)');
  expect(() => validateSpecifications(Array.from({ length: 13 }, (_, i) => ({ label: String(i), value: 'value' })))).toThrow('at most 12');
});
