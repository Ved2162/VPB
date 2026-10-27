import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { createTestDatabase } from './database';
import * as schema from '../src/db/schema';
import { signToken } from '../src/lib/auth';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/db', () => ({ get db() { return state.db; } }));
import * as admin from '../src/app/api/admin/route';
import * as catalog from '../src/app/api/products/route';
import * as productDetail from '../src/app/api/products/[slug]/route';
import * as categories from '../src/app/api/categories/route';
import * as orderApi from '../src/app/api/orders/[id]/route';
import * as seed from '../src/app/api/seed/route';

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let cookie: string;
let customer: typeof schema.users.$inferSelect;
const missing = '00000000-0000-4000-8000-000000000099';
function request(path: string, body?: object, method = 'POST') {
  return new Request('http://localhost' + path, { method: body ? method : 'GET', headers: { cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function save(res: string, data: object, id?: string) {
  const response = await admin.POST(request('/api/admin', { res, data, id }));
  expect(response.status).toBe(200);
  return response.json();
}
async function read(res: string) { return (await admin.GET(request('/api/admin?res=' + res))).json(); }
beforeAll(async () => {
  process.env.JWT_SECRET = 'isolated-admin-persistence-test-secret-only';
  database = await createTestDatabase(); state.db = database.db;
  const [actor, buyer] = await database.db.insert(schema.users).values([
    { name: 'Admin', phone: '9000000081', role: 'admin', passwordHash: 'unused' },
    { name: 'Buyer', phone: '9000000082', role: 'customer', passwordHash: 'unused' },
  ]).returning();
  customer = buyer; cookie = 'vpb_token=' + signToken(actor);
});
afterAll(async () => { await database?.pg.close(); });

test('ordered specifications persist through partial updates, reordering and removal without changing product URLs or inventory', async () => {
  const original = { name: 'VAYUSHASTRA Sankal 8', reelCount: '4 REEL', length: '4 Reels (4,000 meters)', sku: 'SPEC-PERSIST', price: 2800, stockQuantity: 7, specs: { Base: 'Original Sankal 8 Cotton Thread' } };
  const created = await save('product', original);
  const rows = [{ label: 'Base', value: 'Original Sankal 8 Cotton Thread' }, { label: 'Coating', value: '4-layer coating (Heavy Sharp & Finish)' }];
  await save('product', { specs: [...rows, { label: '', value: '' }], name: 'VAYUSHASTRA Sankal 8 (4 REEL)' }, created.id);
  state.db = drizzle(database.pg);
  let detail = await (await productDetail.GET(request('/api/products/vayushastra-sankal-8'), { params: Promise.resolve({ slug: 'vayushastra-sankal-8' }) })).json();
  expect(detail.product).toMatchObject({ price: 2800, stockQuantity: 7, slug: 'vayushastra-sankal-8', specs: rows });
  for (const q of ['VAYUSHASTRA Sankal 8', 'Sankal 8', '4 REEL']) {
    const result = await (await catalog.GET(request('/api/products?q=' + encodeURIComponent(q)))).json();
    expect(result.products.find((p: { id: string }) => p.id === created.id).specs).toEqual(rows);
  }
  await save('product', { specs: [...rows].reverse() }, created.id);
  expect((await read('products')).products.find((p: { id: string }) => p.id === created.id).specs).toEqual([...rows].reverse());
  await save('product', { specs: [] }, created.id);
  detail = await (await productDetail.GET(request('/api/products/vayushastra-sankal-8'), { params: Promise.resolve({ slug: 'vayushastra-sankal-8' }) })).json();
  expect(detail.product.specs).toEqual([]);
  for (const specs of [[{ label: '', value: 'x' }], [{ label: 'Base', value: 5 }], [{ label: 'Base', value: 'x' }, { label: 'base', value: 'y' }], [{ label: 'Base', value: 'x'.repeat(201) }], 'invalid']) {
    expect((await admin.POST(request('/api/admin', { res: 'product', id: created.id, data: { specs } }))).status).toBe(400);
  }
  await database.db.delete(schema.products).where(eq(schema.products.id, created.id));
});

test('handcrafted product writes are denied for customers and delivery sub-admins', async () => {
  const adminCookie = cookie;
  try {
    for (const role of ['customer', 'delivery']) {
      const [actor] = await database.db.insert(schema.users).values({ name: role, phone: role === 'customer' ? '9000000083' : '9000000084', role, passwordHash: 'unused' }).returning();
      cookie = 'vpb_token=' + signToken(actor);
      expect((await admin.POST(request('/api/admin', { res: 'product', data: { name: 'Unauthorized', sku: 'UNAUTHORIZED', price: 100, specs: [{ label: 'Coating', value: 'Forged' }] } }))).status).toBe(403);
      expect((await admin.POST(request('/api/admin', { res: 'product', id: missing, data: { specs: [] } }))).status).toBe(403);
    }
  } finally { cookie = adminCookie; }
});

test('every product field and category field is committed and returned by fresh database/API reads', async () => {
  const created = await save('category', { name: 'Original', image: '/old.png', description: 'Original category' });
  const category = { name: 'Updated category', slug: 'updated-category', description: 'Saved category description', image: '/images/manjha/m02.png', active: true };
  await save('category', category, created.id);
  const initial = await save('product', { name: 'Original product', sku: 'ORIGINAL', price: 100 });
  const updated = {
    name: 'Updated product', slug: 'updated-product', description: 'Saved description', sku: 'UPDATED',
    categoryId: created.id, brand: 'Updated brand', cordCount: 12, reelCount: '2 Reel', length: '4000m',
    price: 2345, comparePrice: 3000, stockQuantity: 17, stockStatus: 'in_stock',
    images: ['/images/manjha/m02.png', '/images/manjha/m03.png'], featured: true, bestseller: true, active: true,
    highlights: ['Saved highlight'], specs: { Material: 'Cotton' },
  };
  await save('product', updated, initial.id);
  await database.pg.exec("UPDATE products SET updated_at = now() - interval '10 days'; UPDATE categories SET created_at = now() - interval '10 days'");
  state.db = drizzle(database.pg);
  expect((await read('products')).products.find((p: { id: string }) => p.id === initial.id)).toMatchObject(updated);
  expect((await read('categories')).categories.find((c: { id: string }) => c.id === created.id)).toMatchObject(category);
  expect((await database.db.select().from(schema.products).where(eq(schema.products.id, initial.id)))[0]).toMatchObject(updated);
  expect((await database.db.select().from(schema.categories).where(eq(schema.categories.id, created.id)))[0]).toMatchObject(category);
  expect((await (await catalog.GET(request('/api/products?q=Updated'))).json()).products[0]).toMatchObject(updated);
  await save('product', { ...updated, active: false, featured: false, bestseller: false, stockQuantity: 0 }, initial.id);
  expect((await read('products')).products[0]).toMatchObject({ active: false, featured: false, bestseller: false, stockQuantity: 0, stockStatus: 'out_of_stock' });
  expect((await (await catalog.GET(request('/api/products?q=Updated'))).json()).products).toHaveLength(0);
  await save('category', { ...category, active: false }, created.id);
  expect((await (await categories.GET()).json()).categories).toHaveLength(0);
  expect((await read('categories')).categories[0].active).toBe(false);
});

test('customer active status and every order status persist, including out for delivery', async () => {
  for (const active of [false, true]) {
    const response = await admin.POST(request('/api/admin', { res: 'customer-toggle', id: customer.id, active }));
    expect(response.status).toBe(200);
    expect((await database.db.select().from(schema.users).where(eq(schema.users.id, customer.id)))[0].active).toBe(active);
    expect((await read('customers')).customers.find((c: { id: string }) => c.id === customer.id).active).toBe(active);
  }
  const [order] = await database.db.insert(schema.orders).values({ userId: customer.id, orderNumber: 'PERSIST-ORDER', subtotal: 200, total: 200 }).returning();
  const context = { params: Promise.resolve({ id: order.id }) };
  for (const orderStatus of ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled']) {
    expect((await orderApi.PATCH(request('/api/orders/' + order.id, { orderStatus }, 'PATCH'), context)).status).toBe(200);
    expect((await database.db.select().from(schema.orders).where(eq(schema.orders.id, order.id)))[0].orderStatus).toBe(orderStatus);
    expect((await (await orderApi.GET(request('/api/orders/' + order.id), context)).json()).order.orderStatus).toBe(orderStatus);
  }
  for (const paymentStatus of ['pending', 'paid', 'failed', 'refunded']) {
    expect((await orderApi.PATCH(request('/api/orders/' + order.id, { paymentStatus }, 'PATCH'), context)).status).toBe(200);
    expect((await database.db.select().from(schema.orders).where(eq(schema.orders.id, order.id)))[0].paymentStatus).toBe(paymentStatus);
  }
});

test('banner and content writes persist; repeated setup does not recreate deletions or reset any data', async () => {
  const banner = await save('banner', { title: 'Before' });
  const updated = { title: 'Saved banner', subtitle: 'Saved subtitle', image: '/images/manjha/m02.png', link: '/shop?tag=featured', active: false };
  await save('banner', updated, banner.id);
  expect((await database.db.select().from(schema.banners).where(eq(schema.banners.id, banner.id)))[0]).toMatchObject(updated);
  for (const value of ['First announcement', 'Updated announcement']) {
    expect((await admin.POST(request('/api/admin', { res: 'content', key: 'announcement', value }))).status).toBe(200);
    expect((await read('content')).content.find((c: { key: string }) => c.key === 'announcement').value).toBe(value);
  }
  const snapshots = await Promise.all(['products', 'categories', 'customers', 'orders', 'content'].map(read));
  const previous = process.env.ALLOW_SEED; process.env.ALLOW_SEED = 'true';
  try {
    expect((await seed.POST(request('/api/seed', {}))).status).toBe(200);
    expect(await Promise.all(['products', 'categories', 'customers', 'orders', 'content'].map(read))).toEqual(snapshots);
    const ids = [(await read('products')).products[0].id, (await read('categories')).categories[0].id, banner.id];
    for (const [index, res] of ['product', 'category', 'banner'].entries()) {
      expect((await admin.DELETE(new Request(`http://localhost/api/admin?res=${res}&id=${ids[index]}`, { method: 'DELETE', headers: { cookie } }))).status).toBe(200);
    }
    expect((await seed.POST(request('/api/seed', {}))).status).toBe(200);
    expect((await read('products')).products).toHaveLength(0);
    expect((await read('categories')).categories).toHaveLength(0);
    expect((await read('content')).banners).toHaveLength(0);
  } finally { if (previous === undefined) delete process.env.ALLOW_SEED; else process.env.ALLOW_SEED = previous; }
});

test('missing records and rejected database writes cannot produce successful saves', async () => {
  for (const [res, data] of [['category', { name: 'Missing' }], ['banner', { title: 'Missing' }]] as const) {
    expect((await admin.POST(request('/api/admin', { res, id: missing, data }))).status).toBe(404);
  }
  expect((await admin.POST(request('/api/admin', { res: 'customer-toggle', id: missing, active: false }))).status).toBe(404);
  expect((await orderApi.PATCH(request('/api/orders/' + missing, { orderStatus: 'packed' }, 'PATCH'), { params: Promise.resolve({ id: missing }) })).status).toBe(404);
  const created = await save('product', { name: 'Unique product', sku: 'UNIQUE', price: 100 });
  expect((await admin.POST(request('/api/admin', { res: 'product', data: { name: 'Duplicate', sku: 'UNIQUE', price: 200 } }))).status).toBe(400);
  expect((await database.db.select().from(schema.products).where(eq(schema.products.id, created.id)))[0].price).toBe(100);
});
