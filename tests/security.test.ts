import { configureTestPayu } from './payu-fixtures';
import { beforeAll, afterAll, test, expect, vi } from 'vitest';
import { createTestDatabase } from './database';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { signToken, verifyToken } from '../src/lib/auth';
import { sameOrigin } from '../src/lib/shipment-rules';
import { readJson, safeReturnPath } from '../src/lib/http-security';
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/db', () => ({ get db() { return state.db; } }));
import * as otp from '../src/app/api/otp/verify/route';
import * as sendOtp from '../src/app/api/otp/send/route';
import * as customerAuth from '../src/app/api/auth/route';
import * as extra from '../src/app/api/extra/route';
import * as checkout from '../src/app/api/payment/create/route';
import * as webhook from '../src/app/api/payment/webhook/route';
import { finalizePayment as finalizeRecordedPayment } from '../src/lib/payment-finalization';
import { finalizeFixturePayment } from './payment-fixture';
const finalizePayment = (confirmation: Parameters<typeof finalizeRecordedPayment>[0]) => finalizeFixturePayment(database.db, confirmation);
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let customer: typeof schema.users.$inferSelect, other: typeof customer, admin: typeof customer;
const code = '123456'; // Disposable test OTP only.
function request(path: string, body: object, user?: typeof customer) {
  return new Request('http://localhost:3100' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(user ? { cookie: 'vpb_token=' + signToken({ ...user, phone: user.phone! }) } : {}) }, body: JSON.stringify(body) });
}
async function seedOtp(phone: string) {
  return (await database.db.insert(schema.otpRequests).values({ phone, otpHash: await bcrypt.hash(code, 4), expiresAt: new Date(Date.now() + 60000) }).returning())[0];
}
beforeAll(async () => {
  configureTestPayu();
  process.env.JWT_SECRET = 'isolated-security-test-secret-never-production';
  process.env.RENFLAIR_API_KEY = '';
  database = await createTestDatabase(); state.db = database.db;
  [customer, other, admin] = await database.db.insert(schema.users).values([
    { name: 'Customer', phone: '9400000001', passwordHash: 'test-only', role: 'customer' },
    { name: 'Other', phone: '9400000002', passwordHash: 'test-only', role: 'customer' },
    { name: 'Admin', phone: '9400000003', passwordHash: 'test-only', role: 'admin' },
  ]).returning();
});
afterAll(async () => { vi.restoreAllMocks(); await database?.pg.close(); });
test('forged JWTs and unsafe navigation paths are rejected', () => {
  expect(verifyToken('eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYWRtaW4ifQ.')).toBeNull();
  expect(safeReturnPath('//evil.example')).toBe('/account');
  expect(safeReturnPath('/\\evil.example')).toBe('/account');
  expect(safeReturnPath('javascript:alert(1)')).toBe('/account');
  expect(safeReturnPath('/checkout?step=1')).toBe('/checkout?step=1');
});
test('browser cross-site mutations and oversized/malformed requests are rejected', async () => {
  expect(() => sameOrigin(new Request('https://vpb.example/api/auth', { headers: { origin: 'https://evil.example' } }))).toThrow('Cross-origin');
  expect(() => sameOrigin(new Request('https://vpb.example/api/auth', { headers: { 'sec-fetch-site': 'cross-site' } }))).toThrow('Cross-origin');
  await expect(readJson(new Request('http://localhost/api', { method: 'POST', body: 'x'.repeat(65537) }))).rejects.toMatchObject({ status: 413 });
  await expect(readJson(new Request('http://localhost/api', { method: 'POST', body: '[' }))).rejects.toMatchObject({ status: 400 });
});
test('OTP cannot authenticate a main admin and cannot be replayed by a customer', async () => {
  await seedOtp(admin.phone!);
  expect((await otp.POST(request('/api/otp/verify', { phone: admin.phone, otp: code }))).status).toBe(403);
  await seedOtp(customer.phone!);
  const success = await otp.POST(request('/api/otp/verify', { phone: customer.phone, otp: code }));
  expect(success.status).toBe(200); expect(success.headers.get('set-cookie')).toContain('HttpOnly');
  expect(await success.json()).not.toHaveProperty('token');
  expect((await otp.POST(request('/api/otp/verify', { phone: customer.phone, otp: code }))).status).toBe(400);
});
test('OTP guesses consume a strict five-attempt budget', async () => {
  const record = await seedOtp(other.phone!);
  for (let i = 0; i < 5; i++) await otp.POST(request('/api/otp/verify', { phone: other.phone, otp: '000000' }));
  const [persisted] = await database.db.select().from(schema.otpRequests).where(eq(schema.otpRequests.id, record.id));
  expect(persisted.attempts).toBe(5); expect(persisted.consumed).toBe(true);
  expect((await otp.POST(request('/api/otp/verify', { phone: other.phone, otp: code }))).status).toBe(400);
});
test('missing new-account name leaves the verified OTP usable for a corrected form', async () => {
  await seedOtp('9400000004');
  const missing = await otp.POST(request('/api/otp/verify', { phone: '9400000004', otp: code }));
  expect((await missing.json()).needName).toBe(true);
  expect((await otp.POST(request('/api/otp/verify', { phone: '9400000004', otp: code, name: 'New Customer' }))).status).toBe(200);
});
test('OTP send limits survive repeated calls and unavailable SMS creates no active OTP', async () => {
  expect((await sendOtp.POST(request('/api/otp/send', { phone: '9400000005' }))).status).toBe(503);
  expect((await sendOtp.POST(request('/api/otp/send', { phone: '9400000005' }))).status).toBe(429);
  expect((await database.db.select().from(schema.otpRequests).where(eq(schema.otpRequests.phone, '9400000005'))).length).toBe(0);
});
test('customers cannot edit another address; disabled sessions cannot access addresses', async () => {
  const [address] = await database.db.insert(schema.addresses).values({ userId: other.id, name: 'Other', phone: other.phone!, addressLine: 'Test street', city: 'Bareilly', state: 'UP', pincode: '243001' }).returning();
  const response = await extra.POST(request('/api/extra', { res: 'address', ...address, name: 'Changed' }, customer));
  expect(response.status).toBe(403);
  await database.db.update(schema.users).set({ active: false }).where(eq(schema.users.id, other.id));
  const denied = await extra.GET(new Request('http://localhost:3100/api/extra?res=addresses', { headers: { cookie: 'vpb_token=' + signToken({ ...other, phone: other.phone! }) } }));
  expect(denied.status).toBe(403);
  const session = await customerAuth.GET(new Request('http://localhost:3100/api/auth', { headers: { cookie: 'vpb_token=' + signToken({ ...other, phone: other.phone! }) } }));
  expect(session.headers.get('set-cookie')).toContain('Max-Age=0');
  expect((await session.json()).user).toBeNull();
});
test('negative/fractional/duplicate cart quantities are rejected before contacting the gateway', async () => {
  const address = { name: 'Customer', phone: customer.phone, addressLine: 'Test street', city: 'Bareilly', state: 'UP', pincode: '243001' };
  for (const qty of [-1, 0, 1.5, 100]) expect((await checkout.POST(request('/api/payment/create', { items: [{ id: customer.id, qty }], address }, customer))).status).toBe(400);
  expect((await checkout.POST(request('/api/payment/create', { items: [{ id: customer.id, qty: 1 }, { id: customer.id, qty: 1 }], address }, customer))).status).toBe(400);
});
test('identical checkout requests reuse one order and a changed address gets a separate order', async () => {
  const [product] = await database.db.insert(schema.products).values({ name: 'Test manjha', slug: 'audit-manjha', sku: 'AUDIT-MANJHA', price: 100, stockQuantity: 10 }).returning();
  const address = { name: 'Customer', phone: customer.phone, addressLine: 'Test street', city: 'Bareilly', state: 'UP', pincode: '243001' };
  const body = { idempotencyKey: crypto.randomUUID(), email: 'fixture@example.com', items: [{ id: product.id, qty: 1 }], address };
  const a = await checkout.POST(request('/api/payment/create', body, customer)), b = await checkout.POST(request('/api/payment/create', body, customer));
  expect(a.status).toBe(200); expect(b.status).toBe(200); expect((await a.clone().json()).fields.txnid).toBe((await b.clone().json()).fields.txnid);
  expect((await checkout.POST(request('/api/payment/create', { ...body, idempotencyKey: crypto.randomUUID(), address: { ...address, addressLine: 'Different street' } }, customer))).status).toBe(200);
  expect((await database.db.select().from(schema.orders).where(eq(schema.orders.userId, customer.id))).length).toBe(2);
});
test.each([100, 5999, 6000, 6200])('checkout charges no shipping at a subtotal of %i and keeps the existing discount', async (price) => {
  const [buyer] = await database.db.insert(schema.users).values({ name: 'Shipping fixture', phone: '950000' + String(price).padStart(4, '0'), passwordHash: 'test-only', role: 'customer' }).returning();
  const [product] = await database.db.insert(schema.products).values({ name: 'Free shipping fixture', slug: 'free-shipping-' + price, sku: 'FREE-SHIP-' + price, price, stockQuantity: 10 }).returning();
  const address = { name: 'Customer', phone: customer.phone, addressLine: 'Test street', city: 'Bareilly', state: 'UP', pincode: '243001' };
  const response = await checkout.POST(request('/api/payment/create', { idempotencyKey: crypto.randomUUID(), email: 'fixture@example.com', items: [{ id: product.id, qty: 1 }], address, shippingCharge: 99, total: 1 }, buyer));
  expect(response.status).toBe(200);
  const discount = price >= 6000 ? 200 : 0;
  const result = await response.json();
  expect(result.fields.amount).toBe((price - discount).toFixed(2));
  const [order] = await database.db.select().from(schema.orders).where(eq(schema.orders.id, result.orderId));
  expect(order).toMatchObject({ subtotal: price, shippingCharge: 0, discount, total: price - discount });
});

test('pincode delivery quotes have free shipping and still reject invalid pincodes', async () => {
  const valid = await extra.POST(request('/api/extra', { res: 'pincode', pincode: '243001' }));
  expect(await valid.json()).toMatchObject({ ok: true, charge: 0 });
  expect((await extra.POST(request('/api/extra', { res: 'pincode', pincode: '123' }))).status).toBe(400);
});

test('captured payment finalization is idempotent and validates amount', async () => {
  const [product] = await database.db.insert(schema.products).values({ name: 'Paid manjha', slug: 'paid-manjha', sku: 'PAID-MANJHA', price: 100, stockQuantity: 10 }).returning();
  const [order] = await database.db.insert(schema.orders).values({ userId: customer.id, orderNumber: 'AUDIT-PAID', subtotal: 200, total: 200, razorpayOrderId: 'order_paid_audit', cartSnapshot: [{ id: product.id, qty: 2, price: 100, name: product.name } as any] }).returning();
  const confirmed = { orderId: 'order_paid_audit', paymentId: 'pay_audit', amount: 20000, currency: 'INR', userId: customer.id };
  await expect(finalizePayment({ ...confirmed, amount: 1 })).rejects.toMatchObject({ status: 400 });
  await finalizePayment(confirmed); expect((await finalizePayment(confirmed)).already).toBe(true);
  expect((await database.db.select().from(schema.products).where(eq(schema.products.id, product.id)))[0].stockQuantity).toBe(8);
  expect((await database.db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id))).length).toBe(1);
});
test('retired gateway webhooks cannot mark historical orders paid', async () => {
    const [order] = await database.db.insert(schema.orders).values({ userId: customer.id, orderNumber: 'AUDIT-RETIRED', subtotal: 100, total: 100, razorpayOrderId: 'order_retired' }).returning();
    for (const event of ['payment.authorized', 'payment.captured']) expect((await webhook.POST()).status).toBe(410);
    expect((await database.db.select().from(schema.orders).where(eq(schema.orders.id, order.id)))[0].paymentStatus).toBe('pending');
  });

test('legacy registration cannot create an unverified phone account or accept a supplied role', async () => {
  const response = await customerAuth.POST(request('/api/auth', { action: 'register', name: 'Unverified', phone: '9400000009', password: 'Test-only-password-2026', role: 'admin' }));
  expect(response.status).toBe(403);
  expect((await database.db.select().from(schema.users).where(eq(schema.users.phone, '9400000009'))).length).toBe(0);
});
