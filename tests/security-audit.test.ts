import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from './database';
import * as schema from '../src/db/schema';
import { signToken, hashPassword } from '../src/lib/auth';
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/db', () => ({ get db() { return state.db; } }));
vi.mock('@/lib/schedule-order-notification', () => ({ scheduleOrderNotification: vi.fn() }));
import * as auth from '../src/app/api/auth/route';
import * as extra from '../src/app/api/extra/route';
import * as settings from '../src/app/api/delivery/settings/route';
import * as webhook from '../src/app/api/payment/webhook/route';
import * as retry from '../src/app/api/payment/retry/route';
import * as checkout from '../src/app/api/payment/create/route';
import * as adminApi from '../src/app/api/admin/route';
import * as gateway from '../src/lib/razorpay';
import { finalizePayment } from '../src/lib/payment-finalization';
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let sequence = 0;
let hash: string;
const password = 'Isolated-audit-password-2026';
async function user(role = 'customer') {
  return (await database.db.insert(schema.users).values({ name: 'Audit fixture', phone: '960000' + String(++sequence).padStart(4, '0'), role, passwordHash: hash }).returning())[0];
}
function cookie(u: typeof schema.users.$inferSelect) { return 'vpb_token=' + signToken({ ...u, phone: u.phone! }); }
function request(path: string, u: typeof schema.users.$inferSelect, data?: object, method = 'POST') {
  return new Request('http://localhost' + path, { method: data ? method : 'GET', headers: { cookie: cookie(u), 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
}
async function product(stock = 10) {
  const n = ++sequence;
  return (await database.db.insert(schema.products).values({ name: 'Audit cotton reel ' + n, slug: 'audit-reel-' + n, sku: 'AUDIT-REEL-' + n, price: 100, stockQuantity: stock }).returning())[0];
}
async function signedEvent(data: object) {
  const raw = JSON.stringify(data);
  return webhook.POST(new Request('http://localhost/api/payment/webhook', { method: 'POST', body: raw, headers: { 'x-razorpay-signature': createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest('hex') } }));
}
beforeAll(async () => {
  process.env.JWT_SECRET = 'isolated-audit-jwt-secret-not-for-production';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'isolated-audit-webhook-secret';
  process.env.MSG91_WHATSAPP_ENABLED = 'false';
  hash = await hashPassword(password);
  database = await createTestDatabase(); state.db = database.db;
});
afterAll(async () => { vi.restoreAllMocks(); await database?.pg.close(); });

test('logout invalidates a copied cookie on the backend', async () => {
  const u = await user(); const oldCookie = cookie(u);
  expect((await auth.DELETE(new Request('http://localhost/api/auth', { method: 'DELETE', headers: { cookie: oldCookie } }))).status).toBe(200);
  expect((await extra.GET(new Request('http://localhost/api/extra?res=addresses', { headers: { cookie: oldCookie } }))).status).toBe(401);
});
test('staff password reset invalidates the old cookie while the new login works', async () => {
  const a = await user('admin'), staff = await user('delivery');
  await database.db.insert(schema.deliveryStaff).values({ userId: staff.id, allOrders: true });
  const oldCookie = cookie(staff);
  expect((await settings.POST(request('/api/delivery/settings', a, { resource: 'staff', id: staff.id, name: staff.name, phone: staff.phone, password: 'Replacement-audit-password-2026', active: true, allOrders: true }))).status).toBe(200);
  expect((await settings.GET(new Request('http://localhost/api/delivery/settings', { headers: { cookie: oldCookie } }))).status).toBe(401);
  const login = await auth.POST(new Request('http://localhost/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', phone: staff.phone, password: 'Replacement-audit-password-2026' }) }));
  expect(login.status).toBe(200);
});
test('a partial processed refund does not mark the full order refunded; duplicate refunds are idempotent', async () => {
  const u = await user();
  const [o] = await database.db.insert(schema.orders).values({ userId: u.id, orderNumber: 'AUDIT-REFUND', subtotal: 100, total: 100, paymentStatus: 'paid', orderStatus: 'confirmed', razorpayOrderId: 'order_refund', razorpayPaymentId: 'pay_refund', paidAt: new Date() }).returning();
  const event = (id: string, amount: number) => ({ event: 'refund.processed', payload: { refund: { entity: { id, payment_id: 'pay_refund', amount, currency: 'INR', status: 'processed' } } } });
  expect((await signedEvent(event('rfnd_partial', 2000))).status).toBe(200);
  expect((await database.db.select().from(schema.orders).where(eq(schema.orders.id, o.id)))[0].paymentStatus).toBe('paid');
  expect((await signedEvent(event('rfnd_partial', 2000))).status).toBe(200);
  expect((await signedEvent(event('rfnd_remaining', 8000))).status).toBe(200);
  expect((await database.db.select().from(schema.orders).where(eq(schema.orders.id, o.id)))[0].paymentStatus).toBe('refunded');
});
test('a cancelled order cannot be reopened for payment by the customer', async () => {
  const u = await user();
  vi.spyOn(gateway, 'getRazorpay').mockReturnValue({ orders: { create: async () => ({ id: 'order_cancelled' }) } } as never);
  const [o] = await database.db.insert(schema.orders).values({ userId: u.id, orderNumber: 'AUDIT-CANCELLED', subtotal: 100, total: 100, paymentStatus: 'failed', orderStatus: 'cancelled', razorpayOrderId: 'order_cancelled' }).returning();
  expect((await retry.POST(request('/api/payment/retry', u, { orderId: o.id }))).status).toBe(409);
});
test('two customers cannot reserve the final reel in separate concurrent checkouts', async () => {
  const a = await user(), b = await user(), p = await product(1); let created = 0;
  vi.spyOn(gateway, 'getRazorpay').mockReturnValue({ orders: { create: async (data: object) => ({ ...data, id: 'order_stock_' + ++created }) } } as never);
  const body = (u: typeof a) => ({ items: [{ id: p.id, qty: 1 }], address: { name: u.name, phone: u.phone, addressLine: 'Fixture street', city: 'Bareilly', state: 'UP', pincode: '243001' } });
  const responses = await Promise.all([checkout.POST(request('/api/payment/create', a, body(a))), checkout.POST(request('/api/payment/create', b, body(b)))]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
});
test('late captured payments with unavailable stock are recorded without confirming fulfillment', async () => {
  const u = await user(), p = await product(0);
  const [o] = await database.db.insert(schema.orders).values({ userId: u.id, orderNumber: 'AUDIT-LATE-CAPTURE', subtotal: 100, total: 100, razorpayOrderId: 'order_late', cartSnapshot: [{ id: p.id, qty: 1, price: 100, name: p.name } as never] }).returning();
  await finalizePayment({ orderId: 'order_late', paymentId: 'pay_late', amount: 10000, currency: 'INR' });
  const [saved] = await database.db.select().from(schema.orders).where(eq(schema.orders.id, o.id));
  expect(saved.paymentStatus).toBe('paid'); expect(saved.paymentData?.stockReviewRequired).toBe(true);
  expect(saved.orderStatus).toBe('placed');
  expect(await database.db.select().from(schema.orderInvoices).where(eq(schema.orderInvoices.orderId, o.id))).toHaveLength(0);
});
test('admin product mutations record an atomic audit entry without private payloads', async () => {
  const a = await user('admin');
  const response = await adminApi.POST(request('/api/admin', a, { res: 'product', data: { name: 'Audit trail reel', sku: 'AUDIT-TRAIL', price: 100, stockQuantity: 5 } }));
  expect(response.status).toBe(200); const { id } = await response.json();
  const events = await database.db.select().from(schema.deliveryAudit).where(eq(schema.deliveryAudit.resourceId, id));
  expect(events).toHaveLength(1); expect(events[0].actorId).toBe(a.id);
});

test('wrong-password responses do not reveal staff or disabled account existence', async () => {
  const a = await user('admin');
  const response = await auth.POST(new Request('http://localhost/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', phone: a.phone, password: 'Incorrect-audit-password' }) }));
  expect(response.status).toBe(401);
  expect((await response.json()).error).toBe('Invalid phone number or password');
});
import * as uploadApi from '../src/app/api/admin/images/route';
test('image upload rejects a forged PNG signature instead of persisting arbitrary bytes', async () => {
  const a = await user('admin');
  const bytes = new Uint8Array([137,80,78,71,13,10,26,10,60,115,99,114,105,112,116,62]);
  const response = await uploadApi.POST(new Request('http://localhost/api/admin/images', { method: 'POST', headers: { cookie: cookie(a) }, body: bytes }));
  expect(response.status).toBe(400);
});
import * as sendOtp from '../src/app/api/otp/send/route';
test('rotating phone numbers and spoofed forwarding values cannot bypass the trusted OTP source budget', async () => {
  vi.stubEnv('VERCEL', '1'); vi.stubEnv('RENFLAIR_API_KEY', '');
  try {
    for (let i = 0; i < 21; i++) {
      const response = await sendOtp.POST(new Request('http://localhost/api/otp/send', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.99', 'x-forwarded-for': '198.51.100.' + i }, body: JSON.stringify({ phone: '970000' + String(i).padStart(4, '0') }) }));
      expect(response.status).toBe(i < 20 ? 503 : 429);
    }
  } finally { vi.unstubAllEnvs(); }
});
import jwt from 'jsonwebtoken';
import { readFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import * as ordersApi from '../src/app/api/orders/[id]/route';
import * as failedApi from '../src/app/api/payment/failed/route';
import { recordRefund } from '../src/lib/refunds';
import { providerBody } from '../src/lib/msg91-diagnostics';

test('JWT claims are allowlisted even when a full database user is passed to signing', async () => {
  const u = await user(); const payload = jwt.decode(signToken(u)) as Record<string, unknown>;
  expect(payload).toHaveProperty('id', u.id); expect(payload).toHaveProperty('sessionVersion', 0);
  for (const key of ['passwordHash', 'active', 'createdAt']) expect(payload).not.toHaveProperty(key);
});
test('repeat checkout renews its own reservation; failed payment releases it for another customer', async () => {
  const a = await user(), b = await user(), p = await product(1); let n = 0;
  vi.spyOn(gateway, 'getRazorpay').mockReturnValue({ orders: { create: async (data: object) => ({ ...data, id: 'order_reservation_' + ++n }) } } as never);
  const body = (u: typeof a) => ({ items: [{ id: p.id, qty: 1 }], address: { name: u.name, phone: u.phone, addressLine: 'Fixture street', city: 'Bareilly', state: 'UP', pincode: '243001' } });
  const first = await (await checkout.POST(request('/api/payment/create', a, body(a)))).json();
  expect((await checkout.POST(request('/api/payment/create', a, body(a)))).status).toBe(200); expect(n).toBe(1);
  expect((await checkout.POST(request('/api/payment/create', b, body(b)))).status).toBe(409);
  expect((await failedApi.POST(request('/api/payment/failed', a, { razorpay_order_id: first.order.id }))).status).toBe(200);
  expect((await checkout.POST(request('/api/payment/create', b, body(b)))).status).toBe(200);
});
test('expired reservations release stock and a late capture cannot take another active reservation', async () => {
  const a = await user(), b = await user(), p = await product(1); let n = 0;
  vi.spyOn(gateway, 'getRazorpay').mockReturnValue({ orders: { create: async (data: object) => ({ ...data, id: 'order_expiry_' + ++n }) } } as never);
  const body = (u: typeof a) => ({ items: [{ id: p.id, qty: 1 }], address: { name: u.name, phone: u.phone, addressLine: 'Fixture street', city: 'Bareilly', state: 'UP', pincode: '243001' } });
  const first = await (await checkout.POST(request('/api/payment/create', a, body(a)))).json();
  await database.db.update(schema.inventoryReservations).set({ expiresAt: new Date(0) }).where(eq(schema.inventoryReservations.productId, p.id));
  expect((await checkout.POST(request('/api/payment/create', b, body(b)))).status).toBe(200);
  const settled = await finalizePayment({ orderId: first.order.id, paymentId: 'pay_expired', amount: 10000, currency: 'INR' });
  expect(settled.order).toMatchObject({ paymentStatus: 'paid', orderStatus: 'placed' });
  expect(settled.order.paymentData?.stockReviewRequired).toBe(true);
  expect((await database.db.select().from(schema.products).where(eq(schema.products.id, p.id)))[0].stockQuantity).toBe(1);
});
test('paid stock holds require available inventory and an admin confirmation before fulfillment', async () => {
  const u = await user(), a = await user('admin'), p = await product(0);
  const [o] = await database.db.insert(schema.orders).values({ userId: u.id, orderNumber: 'AUDIT-RECONCILE', subtotal: 100, total: 100, razorpayOrderId: 'order_reconcile', cartSnapshot: [{ id: p.id, qty: 1, price: 100, name: p.name } as never] }).returning();
  await finalizePayment({ orderId: o.razorpayOrderId!, paymentId: 'pay_reconcile', amount: 10000, currency: 'INR' });
  const context = { params: Promise.resolve({ id: o.id }) };
  expect((await ordersApi.PATCH(request('/api/orders/' + o.id, u, { orderStatus: 'confirmed' }, 'PATCH'), context)).status).toBe(403);
  expect((await ordersApi.PATCH(request('/api/orders/' + o.id, a, { orderStatus: 'shipped' }, 'PATCH'), context)).status).toBe(409);
  expect((await ordersApi.PATCH(request('/api/orders/' + o.id, a, { orderStatus: 'confirmed' }, 'PATCH'), context)).status).toBe(409);
  const publicResponse = await (await ordersApi.GET(request('/api/orders/' + o.id, u), context)).json();
  expect(publicResponse.order.fulfillmentPending).toBe(true); expect(publicResponse.order).not.toHaveProperty('paymentData');
  await database.db.update(schema.products).set({ stockQuantity: 1, stockStatus: 'in_stock' }).where(eq(schema.products.id, p.id));
  expect((await ordersApi.PATCH(request('/api/orders/' + o.id, a, { orderStatus: 'confirmed' }, 'PATCH'), context)).status).toBe(200);
  expect((await database.db.select().from(schema.products).where(eq(schema.products.id, p.id)))[0].stockQuantity).toBe(0);
  expect(await database.db.select().from(schema.orderInvoices).where(eq(schema.orderInvoices.orderId, o.id))).toHaveLength(1);
  expect(await database.db.select().from(schema.orderNotifications).where(eq(schema.orderNotifications.orderId, o.id))).toHaveLength(1);
});
test('out-of-order full refund then capture remains refunded without fulfillment', async () => {
  const u = await user();
  const [o] = await database.db.insert(schema.orders).values({ userId: u.id, orderNumber: 'AUDIT-REFUND-FIRST', subtotal: 100, total: 100, razorpayOrderId: 'order_refund_first' }).returning();
  vi.spyOn(gateway, 'fetchGatewayPayment').mockResolvedValue({ id: 'pay_refund_first', order_id: o.razorpayOrderId, currency: 'INR', amount: 10000 } as never);
  expect((await signedEvent({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_first', payment_id: 'pay_refund_first', amount: 10000, currency: 'INR', status: 'processed' } } } })).status).toBe(200);
  expect((await signedEvent({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_refund_first', order_id: o.razorpayOrderId, amount: 10000, currency: 'INR' } } } })).status).toBe(200);
  expect((await database.db.select().from(schema.orders).where(eq(schema.orders.id, o.id)))[0].paymentStatus).toBe('refunded');
  expect(await database.db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id))).toHaveLength(0);
});
test('refund currency, over-refunds and conflicting duplicate IDs are rejected without erasing prior ledger', async () => {
  const u = await user();
  const [o] = await database.db.insert(schema.orders).values({ userId: u.id, orderNumber: 'AUDIT-REFUND-BOUNDS', subtotal: 100, total: 100, paymentStatus: 'paid', razorpayPaymentId: 'pay_bounds' }).returning();
  await recordRefund({ paymentId: 'pay_bounds', refundId: 'rfnd_bounds', amount: 1000, currency: 'INR' });
  await expect(recordRefund({ paymentId: 'pay_bounds', refundId: 'rfnd_bounds', amount: 2000, currency: 'INR' })).rejects.toMatchObject({ status: 409 });
  await expect(recordRefund({ paymentId: 'pay_bounds', refundId: 'rfnd_over', amount: 10000, currency: 'INR' })).rejects.toMatchObject({ status: 400 });
  await expect(recordRefund({ paymentId: 'pay_bounds', refundId: 'rfnd_usd', amount: 1000, currency: 'USD' })).rejects.toMatchObject({ status: 400 });
  expect((await database.db.select().from(schema.orders).where(eq(schema.orders.id, o.id)))[0].paymentData?.refundedAmount).toBe(1000);
});
test('review submission is serialized to prevent duplicate spam under concurrent requests', async () => {
  const u = await user(), p = await product();
  const body = { res: 'review', productId: p.id, rating: 4, review: 'Good fixture reel', language: 'en' };
  const responses = await Promise.all([extra.POST(request('/api/extra', u, body)), extra.POST(request('/api/extra', u, body))]);
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
  expect(await database.db.select().from(schema.reviews).where(eq(schema.reviews.productId, p.id))).toHaveLength(1);
});
test('oversized decoded-image dimensions are rejected before pixel allocation', async () => {
  const a = await user('admin');
  const image = Buffer.from(await readFile(new URL('../public/images/manjha/m01.png', import.meta.url)));
  image.writeUInt32BE(100000, 16); image.writeUInt32BE(100000, 20); image.writeUInt32BE(crc32(image.subarray(12,29)),29);
  expect((await uploadApi.POST(new Request('http://localhost/api/admin/images', { method: 'POST', headers: { cookie: cookie(a) }, body: image }))).status).toBe(400);
});
test('provider bodies stop reading once the bounded byte budget is exceeded', async () => {
  let cancelled = false, chunks = 0;
  const stream = new ReadableStream({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } });
  expect(await providerBody(new Response(stream))).toEqual({ error: 'provider_response_too_large' });
  expect(cancelled).toBe(true); expect(chunks).toBeLessThanOrEqual(67);
});
test('audit insertion failure rolls back the associated privileged write', async () => {
  const a = await user('admin');
  await database.pg.exec("CREATE FUNCTION audit_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit unavailable'; END $$; CREATE TRIGGER audit_fixture_failure BEFORE INSERT ON delivery_audit FOR EACH ROW EXECUTE FUNCTION audit_fixture_failure();");
  try {
    expect((await adminApi.POST(request('/api/admin', a, { res: 'product', data: { name: 'Must roll back', sku: 'AUDIT-ROLLBACK', price: 100, stockQuantity: 1 } }))).status).toBe(500);
    expect(await database.db.select().from(schema.products).where(eq(schema.products.sku, 'AUDIT-ROLLBACK'))).toHaveLength(0);
  } finally { await database.pg.exec('DROP TRIGGER audit_fixture_failure ON delivery_audit; DROP FUNCTION audit_fixture_failure();'); }
});
