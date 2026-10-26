import { beforeAll, afterAll, test, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { createTestDatabase } from './database';
import * as schema from '../src/db/schema';
import { signToken } from '../src/lib/auth';
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/db', () => ({ get db() { return state.db; } }));
vi.mock('@/lib/schedule-order-notification', () => ({ scheduleOrderNotification: vi.fn() }));
import * as verify from '../src/app/api/payment/verify/route';
import * as webhook from '../src/app/api/payment/webhook/route';
import * as failed from '../src/app/api/payment/failed/route';
import * as ordersApi from '../src/app/api/orders/[id]/route';
import { finalizePayment } from '../src/lib/payment-finalization';
let database: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  process.env.JWT_SECRET = 'isolated-retirement-test-session-secret';
  database = await createTestDatabase(); state.db = database.db;
});
afterAll(async () => { await database.pg.close(); });

test('all retired endpoints reject without changing historical payments or refund ledgers', async () => {
  const [order] = await database.db.insert(schema.orders).values({ orderNumber: 'RETIRED-PAID', subtotal: 100, total: 100,
    paymentMethod: 'razorpay', paymentStatus: 'paid', orderStatus: 'confirmed', paidAt: new Date(),
    razorpayOrderId: 'order_archived', razorpayPaymentId: 'pay_archived', razorpaySignature: 'archived-signature',
    paymentData: { processedRefunds: { rfnd_archived: 1000 }, refundedAmount: 10 } }).returning();
  for (const endpoint of [verify, webhook, failed]) expect((await endpoint.POST()).status).toBe(410);
  expect((await database.db.select().from(schema.orders).where(eq(schema.orders.id, order.id)))[0]).toEqual(order);
  expect(await database.db.select().from(schema.orderNotifications)).toHaveLength(0);
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  expect(packageJson.dependencies).not.toHaveProperty('razorpay');
});

test('historical reconciliation only releases stock for an already paid recorded order and preserves references', async () => {
  const [admin] = await database.db.insert(schema.users).values({ name: 'Historical admin', phone: '9900000101', passwordHash: 'fixture', role: 'admin' }).returning();
  const [product] = await database.db.insert(schema.products).values({ name: 'Cotton reel', slug: 'historical-reel', sku: 'HISTORICAL', price: 100, stockQuantity: 1 }).returning();
  const [order] = await database.db.insert(schema.orders).values({ orderNumber: 'RETIRED-STOCK-HOLD', subtotal: 100, total: 100,
    paymentMethod: 'razorpay', paymentStatus: 'paid', paidAt: new Date(), razorpayOrderId: 'order_stock_archive', razorpayPaymentId: 'pay_stock_archive',
    razorpaySignature: 'keep-recorded-signature', paymentData: { stockReviewRequired: true },
    cartSnapshot: [{ id: product.id, qty: 1, price: 100, name: product.name } as never] }).returning();
  const response = await ordersApi.PATCH(new Request('http://localhost/api/orders/' + order.id, { method: 'PATCH',
    headers: { cookie: 'vpb_token=' + signToken(admin) }, body: JSON.stringify({ orderStatus: 'confirmed' }) }), { params: Promise.resolve({ id: order.id }) });
  expect(response.status).toBe(200);
  const [saved] = await database.db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
  expect(saved).toMatchObject({ paymentStatus: 'paid', orderStatus: 'confirmed', paymentMethod: 'razorpay', razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: order.razorpayPaymentId, razorpaySignature: 'keep-recorded-signature', payuTxnId: null });
  expect(await database.db.select().from(schema.orderInvoices).where(eq(schema.orderInvoices.orderId, order.id))).toHaveLength(1);
  await expect(finalizePayment({ provider: 'historical', orderId: order.razorpayOrderId!, paymentId: order.razorpayPaymentId!, amount: 10000, currency: 'INR' })).rejects.toMatchObject({ status: 410 });
});

test('new rows default to PayU while explicit historical provider labels remain intact', async () => {
  const [fresh] = await database.db.insert(schema.orders).values({ orderNumber: 'PAYU-DEFAULT', subtotal: 100, total: 100 }).returning();
  expect(fresh.paymentMethod).toBe('payu');
  expect((await database.db.select().from(schema.orders).where(eq(schema.orders.orderNumber, 'RETIRED-PAID')))[0].paymentMethod).toBe('razorpay');
});
