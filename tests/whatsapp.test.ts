import { beforeAll, afterAll, beforeEach, afterEach, test, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from './database';
import * as schema from '../src/db/schema';
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/db', () => ({ get db() { return state.db; } }));
vi.mock('@/lib/schedule-order-notification', () => ({ scheduleOrderNotification: vi.fn() }));
import { finalizePayment } from '../src/lib/payment-finalization';
import { processOrderNotifications, safelyProcessOrderNotifications } from '../src/lib/order-notifications';
import { indianWhatsAppNumber, msg91Config, templatePayload } from '../src/lib/msg91';
import * as worker from '../src/app/api/internal/whatsapp/route';
import * as adminRoute from '../src/app/api/admin/notifications/route';
import * as webhook from '../src/app/api/payment/webhook/route';
import * as checkout from '../src/app/api/payment/create/route';
import * as verifyPayment from '../src/app/api/payment/verify/route';
import * as gateway from '../src/lib/razorpay';
import { createHmac } from 'node:crypto';
import { signToken } from '../src/lib/auth';
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let customer: typeof schema.users.$inferSelect, admin: typeof customer;
let counter = 0;
// Transport doubles only: these tests never contact MSG91 or claim live delivery.
const transport = vi.fn();
beforeAll(async () => {
  database = await createTestDatabase(); state.db = database.db;
  [customer, admin] = await database.db.insert(schema.users).values([
    { name: 'Test Customer', phone: '9400000021', passwordHash: 'test', role: 'customer' },
    { name: 'Test Admin', phone: '9400000022', passwordHash: 'test', role: 'admin' },
  ]).returning();
});
beforeEach(() => {
  vi.stubEnv('MSG91_WHATSAPP_ENABLED', 'true'); vi.stubEnv('MSG91_AUTH_KEY', 'unit-test-only');
  vi.stubEnv('MSG91_WHATSAPP_NUMBER', '919400000099'); vi.stubEnv('MSG91_TEMPLATE_NAME', 'test_fixture_only');
  vi.stubEnv('MSG91_TEMPLATE_LANGUAGE', 'en'); vi.stubEnv('MSG91_TEMPLATE_NAMESPACE', 'test-namespace');
  vi.stubEnv('MSG91_TEMPLATE_BODY_VARIABLES', 'customer_name,order_id,order_date,total_amount,confirmation_message,payment_status');
  vi.stubEnv('MSG91_TEMPLATE_AMOUNT_FORMAT', 'currency');
  vi.stubEnv('JWT_SECRET', 'isolated-whatsapp-test-secret-never-production');
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'isolated-webhook-test-secret');
  transport.mockReset().mockResolvedValue(Response.json({ status: 'success', request_id: 'test-request-id' }));
  vi.stubGlobal('fetch', transport);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
afterAll(async () => { await database?.pg.close(); });
async function pending(phone: string | null = customer.phone) {
  const n = ++counter;
  return (await database.db.insert(schema.orders).values({ userId: customer.id, orderNumber: 'WA-TEST-' + n, subtotal: 123, total: 123,
    customerName: customer.name, customerPhone: phone, razorpayOrderId: 'order_wa' + n, cartSnapshot: [] }).returning())[0];
}
async function confirm(order: Awaited<ReturnType<typeof pending>>) {
  return finalizePayment({ orderId: order.razorpayOrderId!, paymentId: 'pay_test' + counter, amount: 12300, currency: 'INR', userId: customer.id });
}
async function notification(id: string) { return (await database.db.select().from(schema.orderNotifications).where(eq(schema.orderNotifications.orderId, id)))[0]; }
function adminRequest(body: object, user = admin) {
  return new Request('http://localhost/api/admin/notifications', { method: 'POST', headers: { cookie: 'vpb_token=' + signToken(user) }, body: JSON.stringify(body) });
}
test('Indian mobile numbers normalize without accepting foreign or malformed numbers', () => {
  for (const phone of ['9400000021', '+91 94000 00021', '919400000021', '09400000021']) expect(indianWhatsAppNumber(phone)).toBe('919400000021');
  for (const phone of [null, '', '+1 4155552671', '1234567890', '++919400000021', '9400000021abc']) expect(indianWhatsAppNumber(phone)).toBeNull();
});
test('pending orders and failed finalization never queue or send', async () => {
  const order = await pending();
  await expect(finalizePayment({ orderId: order.razorpayOrderId!, paymentId: 'pay_bad', amount: 1, currency: 'INR' })).rejects.toThrow();
  expect(await notification(order.id)).toBeUndefined();
  await processOrderNotifications(order.id); expect(transport).not.toHaveBeenCalled();
});
test('failed gateway order creation rolls back the order and cannot queue confirmation', async () => {
  const [product] = await database.db.insert(schema.products).values({ name: 'Test kite', slug: 'wa-failure-test', sku: 'WA-FAILURE', price: 123, stockQuantity: 5 }).returning();
  const ordersBefore = (await database.db.select().from(schema.orders)).length;
  const notificationsBefore = (await database.db.select().from(schema.orderNotifications)).length;
  vi.spyOn(gateway, 'getRazorpay').mockReturnValue({ orders: { create: async () => { throw new Error('gateway unavailable'); } } } as unknown as NonNullable<ReturnType<typeof gateway.getRazorpay>>);
  const response = await checkout.POST(new Request('http://localhost/api/payment/create', { method: 'POST',
    headers: { cookie: 'vpb_token=' + signToken(customer) }, body: JSON.stringify({ items: [{ id: product.id, qty: 1 }],
      address: { name: customer.name, phone: customer.phone, addressLine: 'Test street', city: 'Bareilly', state: 'UP', pincode: '243001' } }) }));
  expect(response.status).toBe(502);
  expect((await database.db.select().from(schema.orders)).length).toBe(ordersBefore);
  expect((await database.db.select().from(schema.orderNotifications)).length).toBe(notificationsBefore);
  expect(transport).not.toHaveBeenCalled();
});
test('checkout callback queues only after server capture verification; callback retries do not resend', async () => {
  const order = await pending();
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'isolated-payment-test-secret');
  const paymentId = 'pay_callback';
  const signature = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(order.razorpayOrderId + '|' + paymentId).digest('hex');
  const request = () => new Request('http://localhost/api/payment/verify', { method: 'POST', headers: { cookie: 'vpb_token=' + signToken(customer) },
    body: JSON.stringify({ razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature }) });
  const captured = { id: paymentId, order_id: order.razorpayOrderId, status: 'captured', amount: 12300, currency: 'INR', method: 'upi' } as Awaited<ReturnType<typeof gateway.fetchGatewayPayment>>;
  const fetchPayment = vi.spyOn(gateway, 'fetchGatewayPayment').mockResolvedValueOnce({ ...captured, status: 'authorized' }).mockResolvedValue(captured);
  expect((await verifyPayment.POST(request())).status).toBe(409);
  expect(await notification(order.id)).toBeUndefined();
  expect((await verifyPayment.POST(request())).status).toBe(200);
  expect((await verifyPayment.POST(request())).status).toBe(200);
  expect(fetchPayment).toHaveBeenCalledTimes(2);
  expect(transport).not.toHaveBeenCalled();
  await processOrderNotifications(order.id); await processOrderNotifications(order.id);
  expect(transport).toHaveBeenCalledTimes(1);
});
test('verified payment creates one durable row; concurrent workers and payment retries send once', async () => {
  const order = await pending(); await confirm(order); await confirm(order);
  await Promise.all([processOrderNotifications(order.id), processOrderNotifications(order.id)]);
  await processOrderNotifications(order.id);
  expect(transport).toHaveBeenCalledTimes(1); expect((await notification(order.id)).status).toBe('accepted');
  const payload = JSON.parse(transport.mock.calls[0][1].body);
  expect(payload.payload.template.to_and_components[0].to).toEqual(['919400000021']);
  expect(payload.payload.template.to_and_components[0].components.body_4.value).toBe('INR 123.00');
  expect(payload.payload.template.to_and_components[0].components.body_6.value).toBe('Paid');
});
test('missing settings keep the queue durable and template variable order is explicit', async () => {
  const order = await pending(); const paid = await confirm(order);
  vi.stubEnv('MSG91_TEMPLATE_BODY_VARIABLES', 'total_amount,order_date,customer_name,order_id');
  expect(templatePayload(msg91Config()!, paid.order, '919400000021').payload.template.to_and_components[0].components.body_1.value).toBe('INR 123.00');
  vi.stubEnv('MSG91_TEMPLATE_NAME', '');
  expect(await processOrderNotifications(order.id)).toEqual({ processed: 0, configured: false });
  expect((await notification(order.id)).status).toBe('pending'); expect(transport).not.toHaveBeenCalled();
});
test('missing or invalid registered phone skips safely without changing the paid order', async () => {
  for (const phone of [null, 'invalid']) {
    const order = await pending(phone); await confirm(order); await processOrderNotifications(order.id);
    expect(await notification(order.id)).toMatchObject({ status: 'skipped', errorCode: 'invalid_recipient' });
    expect((await database.db.select().from(schema.orders).where(eq(schema.orders.id, order.id)))[0].paymentStatus).toBe('paid');
  }
  expect(transport).not.toHaveBeenCalled();
});
test('three-variable template preserves its exact order and does not duplicate its currency symbol', async () => {
  const order = await pending(); const paid = await confirm(order);
  vi.stubEnv('MSG91_TEMPLATE_BODY_VARIABLES', 'customer_name,order_id,total_amount');
  vi.stubEnv('MSG91_TEMPLATE_AMOUNT_FORMAT', 'number');
  vi.stubEnv('MSG91_TEMPLATE_NAMESPACE', 'null');
  const config = msg91Config(); expect(config).not.toBeNull();
  const payload = templatePayload(config!, paid.order, '919400000021');
  expect(JSON.parse(JSON.stringify(payload)).payload.template.namespace).toBeNull();
  expect(payload.payload.template.to_and_components[0].components).toEqual({
    body_1: { type: 'text', value: customer.name },
    body_2: { type: 'text', value: order.orderNumber },
    body_3: { type: 'text', value: '123.00' },
  });
  vi.stubEnv('MSG91_TEMPLATE_AMOUNT_FORMAT', 'invalid'); expect(msg91Config()).toBeNull();
  expect(transport).not.toHaveBeenCalled();
});
test('namespace must be explicitly configured; a real namespace is preserved', () => {
  vi.stubEnv('MSG91_TEMPLATE_NAMESPACE', ''); expect(msg91Config()).toBeNull();
  vi.stubEnv('MSG91_TEMPLATE_NAMESPACE', '   '); expect(msg91Config()).toBeNull();
  vi.stubEnv('MSG91_TEMPLATE_NAMESPACE', 'provided-namespace');
  expect(msg91Config()?.namespace).toBe('provided-namespace');
  vi.stubEnv('MSG91_TEMPLATE_NAMESPACE', 'null'); expect(msg91Config()?.namespace).toBeNull();
});
test.each(['customer_name,order_id', 'order_id,total_amount'])('two-variable templates send only the explicitly configured fields: %s', async mapping => {
  const order = await pending(); const paid = await confirm(order);
  vi.stubEnv('MSG91_TEMPLATE_NAME', 'two_variable_test_fixture');
  vi.stubEnv('MSG91_TEMPLATE_BODY_VARIABLES', mapping);
  const config = msg91Config(); expect(config).not.toBeNull();
  const components = templatePayload(config!, paid.order, '919400000021').payload.template.to_and_components[0].components;
  expect(Object.keys(components)).toEqual(['body_1', 'body_2']);
  if (mapping === 'customer_name,order_id') {
    expect(components.body_1.value).toBe(customer.name); expect(components.body_2.value).toBe(order.orderNumber);
  } else {
    expect(components.body_1.value).toBe(order.orderNumber); expect(components.body_2.value).toBe('INR 123.00');
  }
  expect(transport).not.toHaveBeenCalled();
});
test('missing or unsupported variable mapping blocks provider requests', () => {
  for (const mapping of ['', 'customer_name,', 'customer_name,untrusted_total']) {
    vi.stubEnv('MSG91_TEMPLATE_BODY_VARIABLES', mapping); expect(msg91Config()).toBeNull();
  }
  expect(transport).not.toHaveBeenCalled();
});
test('explicit provider rejection allows admin retry but not customer retry or accepted resend', async () => {
  const order = await pending(); await confirm(order);
  transport.mockResolvedValueOnce(new Response('', { status: 401 }));
  await processOrderNotifications(order.id);
  expect((await notification(order.id)).status).toBe('failed');
  expect((await adminRoute.POST(adminRequest({ orderId: order.id, action: 'retry' }, customer))).status).toBe(403);
  expect((await adminRoute.POST(adminRequest({ orderId: order.id, action: 'retry' }))).status).toBe(200);
  await processOrderNotifications(order.id);
  expect((await notification(order.id)).status).toBe('accepted');
  expect((await adminRoute.POST(adminRequest({ orderId: order.id, action: 'retry' }))).status).toBe(409);
  expect(transport).toHaveBeenCalledTimes(2);
});
test('rate limits use bounded delayed retries', async () => {
  const order = await pending(); await confirm(order);
  transport.mockResolvedValue(new Response('', { status: 429 }));
  await processOrderNotifications(order.id); await processOrderNotifications(order.id);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(await notification(order.id)).toMatchObject({ status: 'retry', attempts: 1 });
  await database.db.update(schema.orderNotifications).set({ attempts: 4, nextAttemptAt: new Date(0) }).where(eq(schema.orderNotifications.orderId, order.id));
  await processOrderNotifications(order.id);
  expect(await notification(order.id)).toMatchObject({ status: 'failed', attempts: 5 });
});
test('transport errors, server failures and unexpected responses are never automatically resent', async () => {
  for (const outcome of ['timeout', 'server', 'malformed']) {
    const order = await pending(); await confirm(order);
    if (outcome === 'timeout') transport.mockRejectedValueOnce(new Error('sensitive transport details'));
    else transport.mockResolvedValueOnce(outcome === 'server' ? new Response('', { status: 500 }) : Response.json({ something: 'unexpected' }));
    await processOrderNotifications(order.id); const calls = transport.mock.calls.length;
    await processOrderNotifications(order.id); expect(transport.mock.calls.length).toBe(calls);
    expect((await notification(order.id)).status).toBe('unknown');
    expect((await adminRoute.POST(adminRequest({ orderId: order.id, action: 'retry' }))).status).toBe(409);
  }
});
test('interrupted workers require reconciliation and can be recorded accepted without resending', async () => {
  const order = await pending(); await confirm(order);
  await database.db.update(schema.orderNotifications).set({ status: 'sending', claimedAt: new Date(0) }).where(eq(schema.orderNotifications.orderId, order.id));
  await processOrderNotifications(order.id);
  expect((await notification(order.id)).status).toBe('unknown');
  expect((await adminRoute.POST(adminRequest({ orderId: order.id, action: 'confirmed_accepted', providerRequestId: 'verified-provider-id' }))).status).toBe(200);
  await processOrderNotifications(order.id); expect(transport).not.toHaveBeenCalled();
});
test('refunded or cancelled orders are rechecked before dispatch', async () => {
  for (const change of [{ paymentStatus: 'refunded' }, { orderStatus: 'cancelled' }]) {
    const order = await pending(); await confirm(order);
    await database.db.update(schema.orders).set(change).where(eq(schema.orders.id, order.id));
    await processOrderNotifications(order.id); expect((await notification(order.id)).status).toBe('skipped');
  }
  expect(transport).not.toHaveBeenCalled();
});
test('signed webhook authorization/failure never queue; repeated captured webhooks queue once', async () => {
  const order = await pending();
  for (const event of ['payment.authorized', 'payment.failed', 'payment.captured', 'payment.captured']) {
    const raw = JSON.stringify({ event, payload: { payment: { entity: { order_id: order.razorpayOrderId, id: 'pay_webhook', amount: 12300, currency: 'INR' } } } });
    const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest('hex');
    expect((await webhook.POST(new Request('http://localhost/api/payment/webhook', { method: 'POST', body: raw, headers: { 'x-razorpay-signature': signature } }))).status).toBe(200);
    if (event !== 'payment.captured') expect(await notification(order.id)).toBeUndefined();
  }
  await processOrderNotifications(order.id); expect(transport).toHaveBeenCalledTimes(1);
});
test('worker requires its own strong credential', async () => {
  vi.stubEnv('CRON_SECRET', 'test-worker-secret-with-at-least-32-characters');
  expect((await worker.GET(new Request('http://localhost/api/internal/whatsapp'))).status).toBe(401);
  vi.stubEnv('MSG91_WHATSAPP_ENABLED', 'false');
  expect((await worker.GET(new Request('http://localhost/api/internal/whatsapp', { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } }))).status).toBe(200);
});
test('background database failure returns sanitized error without altering payment', async () => {
  const saved = state.db; state.db = null;
  expect(await safelyProcessOrderNotifications()).toEqual({ processed: 0, error: 'worker_failed' });
  state.db = saved;
});
