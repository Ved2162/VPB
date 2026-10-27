import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { createTestDatabase } from './database';
import * as schema from '../src/db/schema';
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/db', () => ({ get db() { return state.db; } }));
import { GET as catalog } from '../src/app/api/products/route';
import { GET as detail } from '../src/app/api/products/[slug]/route';
import { publicReviews } from '../src/lib/reviews';
let database: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => { database = await createTestDatabase(); state.db = database.db; });
afterAll(async () => { await database.pg.close(); });

test('official product names and recognizable fragments match through existing catalog search', async () => {
  await database.db.insert(schema.products).values([
    { name: 'VAYUSHASTRA Sankal 8 (4 REEL)', slug: 'official-sankal', sku: 'OFFICIAL-SANKAL', price: 2800 },
    { name: 'THE ROCK BREAKER (Sankal 8, 2 REEL)', slug: 'official-rock', sku: 'OFFICIAL-ROCK', price: 1700 },
    { name: 'VAYUSHASTRA PANDA 5 (3 REEL)', slug: 'official-panda', sku: 'OFFICIAL-PANDA', price: 2100 },
  ]);
  for (const [q, sku] of [['VAYUSHASTRA Sankal 8', 'OFFICIAL-SANKAL'], ['Sankal 8', 'OFFICIAL-SANKAL'], ['THE ROCK BREAKER', 'OFFICIAL-ROCK'], ['VAYUSHASTRA PANDA 5', 'OFFICIAL-PANDA'], ['PANDA 5', 'OFFICIAL-PANDA']]) {
    const result = await (await catalog(new Request('http://localhost/api/products?q=' + encodeURIComponent(q)))).json();
    expect(result.products.map((p: { sku: string }) => p.sku)).toContain(sku);
  }
  await database.pg.exec("DELETE FROM products WHERE sku LIKE 'OFFICIAL-%'");
});
test('public catalog hides legacy kites without deleting them or unrelated accessories', async () => {
  const [cat] = await database.db.insert(schema.categories).values({ name: 'Kites', slug: 'kites' }).returning();
  await database.db.insert(schema.products).values([
    { name: 'Designer Patang', slug: 'designer-patang', sku: 'LEGACY', price: 100 },
    { name: 'Old collection', slug: 'old-collection', sku: 'OLD', price: 100, categoryId: cat.id },
    { name: 'Kite manjha 9 Cord', slug: 'cotton-manjha', sku: 'COTTON', price: 100 },
    { name: 'Charkhi', slug: 'charkhi', sku: 'CHARKHI', price: 50 },
  ]);
  const result = await (await catalog(new Request('http://localhost/api/products'))).json();
  expect(result.ok).toBe(true);
  expect(result.products.map((p: { sku: string }) => p.sku).sort()).toEqual(['CHARKHI', 'COTTON']);
  expect((await detail(new Request('http://localhost'), { params: Promise.resolve({ slug: 'designer-patang' }) })).status).toBe(404);
  expect(await database.db.select().from(schema.products)).toHaveLength(4);
});
test('ratings exclude pending, rejected and demo reviews; verified badges require paid product orders', async () => {
  const [p] = await database.db.insert(schema.products).values({ name: 'Rating reel', slug: 'rating-reel', sku: 'RATE', price: 100, rating: '4.9', reviewCount: 2400 }).returning();
  const [u] = await database.db.insert(schema.users).values({ name: 'Customer', phone: '9000000099', passwordHash: 'unused' }).returning();
  await database.db.insert(schema.reviews).values([
    { productId: p.id, userId: u.id, rating: 4, review: '<script>alert(1)</script>', status: 'approved', language: 'gu-Latn' },
    { productId: p.id, userId: u.id, rating: 1, status: 'pending' },
    { productId: p.id, userId: u.id, rating: 1, status: 'rejected' },
    { productId: p.id, userId: u.id, rating: 5, status: 'approved', isDemo: true },
  ]);
  const response = await (await detail(new Request('http://localhost'), { params: Promise.resolve({ slug: p.slug }) })).json();
  expect(response.product).toMatchObject({ rating: '4.00', reviewCount: 1 });
  expect(response.reviews).toHaveLength(1);
  expect(response.reviews[0].verifiedPurchase).toBe(false);
  const [order] = await database.db.insert(schema.orders).values({ orderNumber: 'REVIEW-PAID', userId: u.id, subtotal: 100, total: 100, paymentStatus: 'paid' }).returning();
  await database.db.insert(schema.orderItems).values({ orderId: order.id, productId: p.id, productName: p.name, quantity: 1, price: 100 });
  expect((await publicReviews(p.id))[0].verifiedPurchase).toBe(true);
});
import { POST as submitReview } from '../src/app/api/extra/route';
import { POST as moderate } from '../src/app/api/admin/route';
import { signToken } from '../src/lib/auth';
test('authenticated multilingual submissions require moderation, validate language and reject duplicate spam', async () => {
  process.env.JWT_SECRET = 'isolated-review-test-secret-not-a-production-credential';
  const [u] = await database.db.insert(schema.users).values({ name: 'Reviewer', phone: '9000000088', passwordHash: 'unused' }).returning();
  const [a] = await database.db.insert(schema.users).values({ name: 'Moderator', phone: '9000000089', passwordHash: 'unused', role: 'admin' }).returning();
  const [p] = await database.db.insert(schema.products).values({ name: 'New review reel', slug: 'new-review-reel', sku: 'NEW-REVIEW', price: 100 }).returning();
  const request = (user: typeof u, data: object) => new Request('http://localhost/api/extra', { method: 'POST', headers: { cookie: 'vpb_token='+signToken({ ...user, phone: user.phone! }), 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = { res: 'review', productId: p.id, rating: 4, review: 'Quality sari che', language: 'gu-Latn' };
  expect((await submitReview(request(u, { ...body, language: 'invalid' }))).status).toBe(400);
  expect((await submitReview(request(u, body))).status).toBe(200);
  expect(await publicReviews(p.id)).toHaveLength(0);
  expect((await submitReview(request(u, body))).status).toBe(409);
  const rows = await database.db.select().from(schema.reviews);
  const pending = rows.find(r=>r.productId===p.id)!;
  expect((await moderate(request(u, { res: 'review', id: pending.id, status: 'approved' }))).status).toBe(403);
  expect((await moderate(request(a, { res: 'review', id: pending.id, status: 'approved' }))).status).toBe(200);
  expect(await publicReviews(p.id)).toMatchObject([{ review: 'Quality sari che', language: 'gu-Latn', verifiedPurchase: false }]);
});
