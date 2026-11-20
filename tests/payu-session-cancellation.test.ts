import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from './database';
import { configureTestPayu } from './payu-fixtures';
import * as schema from '../src/db/schema';
import { signToken } from '../src/lib/auth';
import * as cancelRoute from '../src/app/api/payment/cancel-session/route';
import * as payuPayments from '../src/lib/payu-payments';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/db', () => ({ get db() { return state.db; } }));
vi.mock('@/lib/schedule-order-notification', () => ({ scheduleOrderNotification: vi.fn() }));

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let sequence = 0;

beforeAll(async () => {
  configureTestPayu();
  process.env.JWT_SECRET = 'isolated-cancel-session-tests-secret';
  process.env.MSG91_WHATSAPP_ENABLED = 'false';
  database = await createTestDatabase();
  state.db = database.db;
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); configureTestPayu(); });
afterAll(async () => { await database.pg.close(); });

type User = typeof schema.users.$inferSelect;

function request(orderId: string, user: User) {
  return new Request('http://localhost:3100/api/payment/cancel-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'vpb_token=' + signToken(user),
    },
    body: JSON.stringify({ orderId }),
  });
}

async function setup() {
  const n = ++sequence;
  const [user] = await database.db
    .insert(schema.users)
    .values({ name: 'Cancel Test', phone: '980000' + String(n).padStart(4, '0'), passwordHash: 'test-only' })
    .returning();
  const [product] = await database.db
    .insert(schema.products)
    .values({ name: 'Cancel product', slug: 'cancel-' + n, sku: 'CANCEL-' + n, price: 950, stockQuantity: 5 })
    .returning();
  const [order] = await database.db
    .insert(schema.orders)
    .values({
      userId: user.id,
      orderNumber: 'CANCEL-' + n,
      subtotal: 950,
      discount: 0,
      shippingCharge: 0,
      total: 950,
      paymentStatus: 'pending',
      orderStatus: 'placed',
      paymentMethod: 'payu',
      customerName: user.name,
      customerEmail: 'cancel@example.com',
      customerPhone: user.phone,
      shippingAddress: { name: user.name, phone: user.phone, addressLine: '1 Test St', city: 'Mumbai', state: 'MH', pincode: '400001', landmark: '' },
      cartSnapshot: [{ id: product.id, qty: 1 }],
    })
    .returning();
  const [attempt] = await database.db
    .insert(schema.payuAttempts)
    .values({
      txnId: 'cancel-txn-' + String(n).padStart(6, '0'),
      orderId: order.id,
      environment: 'test',
      merchantKey: 'isolated-payu-merchant-key',
      amount: 95000,
      firstname: user.name,
      email: 'cancel@example.com',
      status: 'pending',
    })
    .returning();
  await database.db
    .update(schema.orders)
    .set({ payuTxnId: attempt.txnId })
    .where(eq(schema.orders.id, order.id));
  return { user, product, order, attempt };
}

function mockReconcileAsSuccess(txnid: string, orderId: string) {
  vi.spyOn(payuPayments, 'reconcilePayu').mockImplementationOnce(async () => {
    await database.db.update(schema.orders)
      .set({ paymentStatus: 'paid', orderStatus: 'confirmed' })
      .where(eq(schema.orders.payuTxnId, txnid));
    await database.db.update(schema.payuAttempts)
      .set({ status: 'paid', paymentId: 'mihpay-' + txnid, verifiedAt: new Date() })
      .where(eq(schema.payuAttempts.txnId, txnid));
    const [o] = await database.db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    return o;
  });
}

function mockReconcileAsFailure(txnid: string, orderId: string) {
  vi.spyOn(payuPayments, 'reconcilePayu').mockImplementationOnce(async () => {
    await database.db.update(schema.orders)
      .set({ paymentStatus: 'failed' })
      .where(eq(schema.orders.payuTxnId, txnid));
    await database.db.update(schema.payuAttempts)
      .set({ status: 'failed', verifiedAt: new Date() })
      .where(eq(schema.payuAttempts.txnId, txnid));
    const [o] = await database.db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    return o;
  });
}

function mockReconcileAsPending(txnid: string, orderId: string) {
  vi.spyOn(payuPayments, 'reconcilePayu').mockImplementationOnce(async () => {
    await database.db.update(schema.payuAttempts)
      .set({ verifiedAt: new Date() })
      .where(eq(schema.payuAttempts.txnId, txnid));
    const [o] = await database.db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    return o;
  });
}

describe('cancel-session route', () => {

  it('returns verified_failed when PayU confirms cancellation', async () => {
    const { user, order, attempt } = await setup();
    mockReconcileAsFailure(attempt.txnId, order.id);

    const res = await cancelRoute.POST(request(order.id, user));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.status).toBe('verified_failed');
    expect(body.paymentStatus).toBe('failed');

    const [updated] = await database.db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(updated.paymentStatus).toBe('failed');
  });

  it('returns verified_paid when PayU reports success', async () => {
    const { user, order, attempt } = await setup();
    mockReconcileAsSuccess(attempt.txnId, order.id);

    const res = await cancelRoute.POST(request(order.id, user));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.status).toBe('verified_paid');
    expect(body.paymentStatus).toBe('paid');
  });

  it('returns still_pending when PayU has not finalised', async () => {
    const { user, order, attempt } = await setup();
    mockReconcileAsPending(attempt.txnId, order.id);

    const res = await cancelRoute.POST(request(order.id, user));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.status).toBe('still_pending');
    expect(body.paymentStatus).toBe('pending');
    expect(body.canRetry).toBe(false);
  });

  it('returns already_paid without calling PayU when order is already paid', async () => {
    const { user, order } = await setup();
    await database.db.update(schema.orders)
      .set({ paymentStatus: 'paid', orderStatus: 'confirmed' })
      .where(eq(schema.orders.id, order.id));

    const reconSpy = vi.spyOn(payuPayments, 'reconcilePayu');
    const res = await cancelRoute.POST(request(order.id, user));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.status).toBe('already_paid');
    expect(reconSpy).not.toHaveBeenCalled();
  });

  it('returns verification_unavailable when PayU API throws', async () => {
    const { user, order } = await setup();
    vi.spyOn(payuPayments, 'reconcilePayu').mockRejectedValueOnce(
      new Error('PayU temporarily unavailable')
    );

    const res = await cancelRoute.POST(request(order.id, user));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.status).toBe('verification_unavailable');
    expect(body.canRetry).toBe(true);
  });

  it('returns 404 when a different user tries to cancel', async () => {
    const { order } = await setup();
    const [other] = await database.db
      .insert(schema.users)
      .values({ name: 'Other', phone: '970099' + String(++sequence).padStart(4, '0'), passwordHash: 'x' })
      .returning();

    const res = await cancelRoute.POST(request(order.id, other));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('returns 400 for a malformed order ID', async () => {
    const { user } = await setup();
    const res = await cancelRoute.POST(
      new Request('http://localhost:3100/api/payment/cancel-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: 'vpb_token=' + signToken(user) },
        body: JSON.stringify({ orderId: 'not-a-uuid' }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('skips PayU call when attempt is already paid', async () => {
    const { user, order, attempt } = await setup();
    await database.db.update(schema.payuAttempts)
      .set({ status: 'paid', paymentId: 'mih-pre-paid', verifiedAt: new Date() })
      .where(eq(schema.payuAttempts.txnId, attempt.txnId));

    const reconSpy = vi.spyOn(payuPayments, 'reconcilePayu');
    const res = await cancelRoute.POST(request(order.id, user));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.status).toBe('verified_paid');
    expect(reconSpy).not.toHaveBeenCalled();
  });

  it('skips PayU call when attempt is already verified failed', async () => {
    const { user, order, attempt } = await setup();
    await database.db.update(schema.payuAttempts)
      .set({ status: 'failed', verifiedAt: new Date() })
      .where(eq(schema.payuAttempts.txnId, attempt.txnId));

    const reconSpy = vi.spyOn(payuPayments, 'reconcilePayu');
    const res = await cancelRoute.POST(request(order.id, user));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.status).toBe('verified_failed');
    expect(reconSpy).not.toHaveBeenCalled();
  });

});
