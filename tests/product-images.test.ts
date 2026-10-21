import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from './database';
import * as schema from '../src/db/schema';
import { signToken } from '../src/lib/auth';
import { MAX_IMAGE_BYTES } from '../src/lib/product-images';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/db', () => ({ get db() { return state.db; } }));
import { POST as upload } from '../src/app/api/admin/images/route';
import { GET as download } from '../src/app/api/images/[id]/route';
import * as admin from '../src/app/api/admin/route';
import * as seed from '../src/app/api/seed/route';

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let cookie: string;
let png: Buffer;
beforeAll(async () => {
  process.env.JWT_SECRET = 'isolated-product-test-secret-not-for-production';
  database = await createTestDatabase(); state.db = database.db;
  const [user] = await database.db.insert(schema.users).values({ name: 'Image admin', phone: '9000000091', passwordHash: 'unused-test-hash', role: 'admin' }).returning();
  cookie = 'vpb_token=' + signToken({ ...user, phone: user.phone! });
  png = await readFile(new URL('../public/images/manjha/m01.png', import.meta.url));
});
afterAll(async () => { await database?.pg.close(); });
const request = (data: object) => new Request('http://localhost/api/admin', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

test('uploaded bytes and product edits survive later reads and repeated seed calls', async () => {
  const response = await upload(new Request('http://localhost/api/admin/images', { method: 'POST', headers: { cookie }, body: new Uint8Array(png) }));
  expect(response.status).toBe(200);
  const { url } = await response.json();
  const data = { name: 'Adnan 9 Cord Special', sku: 'VPB-ADN-9C', price: 4321, stockQuantity: 7, images: [url], description: 'Admin custom description' };
  expect((await admin.POST(request({ res: 'product', data }))).status).toBe(200);
  const [product] = await database.db.select().from(schema.products).where(eq(schema.products.sku, data.sku));
  const updated = { ...data, name: 'Admin renamed product', slug: 'admin-renamed-product', price: 4567 };
  expect((await admin.POST(request({ res: 'product', id: product.id, data: updated }))).status).toBe(200);
  const previous = process.env.ALLOW_SEED;
  process.env.ALLOW_SEED = 'true';
  try {
    expect((await seed.POST(request({}))).status).toBe(200);
    expect((await seed.POST(request({}))).status).toBe(200);
  } finally { if (previous === undefined) delete process.env.ALLOW_SEED; else process.env.ALLOW_SEED = previous; }
  const [saved] = await database.db.select().from(schema.products).where(eq(schema.products.id, product.id));
  expect(saved).toMatchObject(updated);
  // Advance the database's record age beyond the reported reset window.
  await database.pg.exec("UPDATE product_images SET created_at = now() - interval '10 days'");
  const image = await download(new Request('http://localhost' + url), { params: Promise.resolve({ id: url.split('/').pop() }) });
  expect(image.status).toBe(200);
  expect(image.headers.get('Content-Type')).toBe('image/png');
  expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
  const listing = await admin.GET(new Request('http://localhost/api/admin?res=products', { headers: { cookie } }));
  expect((await listing.json()).products.find((p: { id: string }) => p.id === product.id)).toMatchObject(updated);
});

test('upload rejects anonymous, cross-origin, unsupported and oversized requests', async () => {
  expect((await upload(new Request('http://localhost/api/admin/images', { method: 'POST', body: new Uint8Array(png) }))).status).toBe(401);
  expect((await upload(new Request('http://localhost/api/admin/images', { method: 'POST', headers: { cookie, origin: 'https://evil.example' }, body: new Uint8Array(png) }))).status).toBe(403);
  expect((await upload(new Request('http://localhost/api/admin/images', { method: 'POST', headers: { cookie }, body: '<svg onload="alert(1)"></svg>' }))).status).toBe(400);
  expect((await upload(new Request('http://localhost/api/admin/images', { method: 'POST', headers: { cookie }, body: new Uint8Array(MAX_IMAGE_BYTES + 1) }))).status).toBe(413);
});

test('editing a missing product cannot report a successful save', async () => {
  expect((await admin.POST(request({ res: 'product', id: '00000000-0000-4000-8000-000000000099', data: { name: 'Missing', price: 100, sku: 'MISSING' } }))).status).toBe(404);
});
