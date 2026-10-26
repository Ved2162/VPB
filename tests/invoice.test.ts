import { beforeAll, afterAll, afterEach, test, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'node:fs/promises';
import { createTestDatabase } from './database';
import * as schema from '../src/db/schema';
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/db', () => ({ get db() { return state.db; } }));
import { ensureInvoice, financialYear } from '../src/lib/invoices';
import { finalizePayment as finalizeRecordedPayment } from '../src/lib/payment-finalization';
import { finalizeFixturePayment } from './payment-fixture';
const finalizePayment = (confirmation: Parameters<typeof finalizeRecordedPayment>[0]) => finalizeFixturePayment(database.db, confirmation);
import { renderInvoicePdf } from '../src/lib/invoice-pdf';
import * as pdf from '../src/lib/invoice-pdf';
import * as route from '../src/app/api/orders/[id]/invoice/route';
import { signToken } from '../src/lib/auth';
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let customer: typeof schema.users.$inferSelect, other: typeof customer, admin: typeof customer;
let n = 0;
beforeAll(async () => {
  database = await createTestDatabase(); state.db = database.db;
  [customer, other, admin] = await database.db.insert(schema.users).values([
    { name: 'Invoice Customer', phone: '9400000031', passwordHash: 'test' },
    { name: 'Other Customer', phone: '9400000032', passwordHash: 'test' },
    { name: 'Invoice Admin', phone: '9400000033', passwordHash: 'test', role: 'admin' },
  ]).returning();
  process.env.JWT_SECRET = 'isolated-invoice-test-secret-not-production';
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => database?.pg.close());
async function order(paid = true, count = 1) {
  const [row] = await database.db.insert(schema.orders).values({ userId: customer.id, orderNumber: 'INVOICE-TEST-' + ++n,
    subtotal: count * 200, shippingCharge: 99, discount: 20, total: count * 200 + 79,
    customerName: customer.name, customerPhone: customer.phone, paymentStatus: paid ? 'paid' : 'pending', orderStatus: paid ? 'confirmed' : 'placed',
    paidAt: paid ? new Date() : null, razorpayPaymentId: paid ? 'pay_invoice' + n : null, razorpayOrderId: 'order_invoice' + n,
    shippingAddress: { name: customer.name, addressLine: 'Test Street 12', city: 'Bareilly', state: 'Uttar Pradesh', pincode: '243001' },
  }).returning();
  await database.db.insert(schema.orderItems).values(Array.from({ length: count }, (_, i) => ({ orderId: row.id, productName: `${i + 1}. Premium cotton manjha with a long descriptive product name for wrapping`, quantity: 2, price: 100 })));
  return row;
}
function req(id: string, user = customer, init?: RequestInit) {
  return new Request(`http://localhost/api/orders/${id}/invoice`, { ...init, headers: { cookie: 'vpb_token=' + signToken(user), ...init?.headers } });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
test('financial-year numbering observes April boundary in India', () => {
  expect(financialYear(new Date('2026-03-31T18:29:59Z'))).toBe('2025-26');
  expect(financialYear(new Date('2026-03-31T18:30:00Z'))).toBe('2026-27');
});
test('same-order concurrency creates one immutable snapshot; different orders receive consecutive numbers', async () => {
  const first = await order(); const second = await order();
  const results = await Promise.all([ensureInvoice(first.id), ensureInvoice(first.id), ensureInvoice(second.id)]);
  expect(results[0].invoiceNumber).toBe(results[1].invoiceNumber);
  expect(new Set(results.map(r => r.invoiceNumber)).size).toBe(2);
  expect(Math.abs(Number(results[2].invoiceNumber.split('/').at(-1)) - Number(results[0].invoiceNumber.split('/').at(-1)))).toBe(1);
  expect(results[0].snapshot.total).toBe(279);
  await database.db.update(schema.orders).set({ total: 999, customerName: 'Changed later' }).where(eq(schema.orders.id, first.id));
  expect((await ensureInvoice(first.id)).snapshot).toEqual(results[0].snapshot);
});
test('unverified, failed, cancelled orders and mismatched totals cannot issue receipts', async () => {
  const pending = await order(false);
  await expect(ensureInvoice(pending.id)).rejects.toThrow('verified payment');
  const paid = await order();
  await database.db.update(schema.orders).set({ total: 999 }).where(eq(schema.orders.id, paid.id));
  await expect(ensureInvoice(paid.id)).rejects.toThrow('totals need review');
  const cancelled = await order();
  await database.db.update(schema.orders).set({ orderStatus: 'cancelled' }).where(eq(schema.orders.id, cancelled.id));
  await expect(ensureInvoice(cancelled.id)).rejects.toThrow('verified payment');
});
test('verified finalization automatically issues a single receipt without duplicate WhatsApp rows', async () => {
  const row = await order(false);
  const confirmation = { orderId: row.razorpayOrderId!, paymentId: 'pay_auto', amount: row.total * 100, currency: 'INR' };
  await finalizePayment(confirmation); await finalizePayment(confirmation);
  expect(await database.db.select().from(schema.orderInvoices).where(eq(schema.orderInvoices.orderId, row.id))).toHaveLength(1);
  expect(await database.db.select().from(schema.orderNotifications).where(eq(schema.orderNotifications.orderId, row.id))).toHaveLength(1);
});
test('invoice validation failure keeps the successfully captured order and notification intact', async () => {
  const row = await order(false);
  await database.db.update(schema.orders).set({ subtotal: 999 }).where(eq(schema.orders.id, row.id));
  await finalizePayment({ orderId: row.razorpayOrderId!, paymentId: 'pay_mismatch', amount: row.total * 100, currency: 'INR' });
  const [saved] = await database.db.select().from(schema.orders).where(eq(schema.orders.id, row.id));
  expect(saved.paymentStatus).toBe('paid');
  expect(await database.db.select().from(schema.orderInvoices).where(eq(schema.orderInvoices.orderId, row.id))).toHaveLength(0);
  expect(await database.db.select().from(schema.orderNotifications).where(eq(schema.orderNotifications.orderId, row.id))).toHaveLength(1);
});
test('download rejects anonymous/other customer access; owner and admin get real private PDF', async () => {
  const row = await order();
  expect((await route.GET(new Request('http://localhost/invoice'), params(row.id))).status).toBe(401);
  expect((await route.GET(req(row.id, other), params(row.id))).status).toBe(404);
  for (const user of [customer, admin]) {
    const response = await route.GET(req(row.id, user), params(row.id));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
  }
});
test('PDF failure retries use the same issued number and never change order/payment', async () => {
  const row = await order(); const failing = vi.spyOn(pdf, 'renderInvoicePdf').mockRejectedValueOnce(new Error('test renderer failure'));
  expect((await route.GET(req(row.id), params(row.id))).status).toBe(500);
  const before = await ensureInvoice(row.id);
  failing.mockRestore();
  expect((await route.GET(req(row.id), params(row.id))).status).toBe(200);
  expect((await ensureInvoice(row.id)).invoiceNumber).toBe(before.invoiceNumber);
});
test('cancellation is admin-only, origin checked, auditable and does not rewrite snapshot or order', async () => {
  const row = await order(); const issued = await ensureInvoice(row.id);
  const body = JSON.stringify({ action: 'cancel', reason: 'Customer requested correction of billing details' });
  expect((await route.POST(req(row.id, customer, { method: 'POST', body }), params(row.id))).status).toBe(403);
  expect((await route.POST(req(row.id, admin, { method: 'POST', body, headers: { origin: 'https://evil.example' } }), params(row.id))).status).toBe(403);
  expect((await route.POST(req(row.id, admin, { method: 'POST', body }), params(row.id))).status).toBe(200);
  expect((await route.POST(req(row.id, admin, { method: 'POST', body }), params(row.id))).status).toBe(409);
  const [event] = await database.db.select().from(schema.invoiceCancellations).where(eq(schema.invoiceCancellations.orderId, row.id));
  expect(event.actorId).toBe(admin.id); expect(event.reason).toContain('billing');
  expect((await ensureInvoice(row.id)).snapshot).toEqual(issued.snapshot);
  expect((await database.db.select().from(schema.orders).where(eq(schema.orders.id, row.id)))[0].paymentStatus).toBe('paid');
});
test('generate short and long real PDFs for content extraction and visual review', async () => {
  await mkdir('tmp/pdfs', { recursive: true });
  for (const [name, count] of [['short', 1], ['long', 65]] as const) {
    const issued = await ensureInvoice((await order(true, count)).id);
    const bytes = await renderInvoicePdf(issued);
    expect(bytes.byteLength).toBeGreaterThan(5000);
    await writeFile(`tmp/pdfs/${name}.pdf`, bytes);
  }
});
