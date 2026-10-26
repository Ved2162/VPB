import { beforeAll, afterAll, afterEach, test, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from './database';
import { configureTestPayu } from './payu-fixtures';
import * as schema from '../src/db/schema';
import { signToken } from '../src/lib/auth';
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/db', () => ({ get db() { return state.db; } }));
vi.mock('@/lib/schedule-order-notification', () => ({ scheduleOrderNotification: vi.fn() }));
import * as create from '../src/app/api/payment/create/route';
import * as retry from '../src/app/api/payment/retry/route';
import * as verify from '../src/app/api/payment/payu/verify/route';
import * as webhook from '../src/app/api/payment/payu/webhook/route';
import * as returned from '../src/app/api/payment/payu/return/route';
import * as paymentStatus from '../src/app/api/payment/payu/status/route';
import * as orderApi from '../src/app/api/orders/[id]/route';
import * as extra from '../src/app/api/extra/route';
import { reconcilePayu } from '../src/lib/payu-payments';
import { amountInPaise, requestHash, sha512, validResponseHash } from '../src/lib/payu';
import { ensureInvoice } from '../src/lib/invoices';
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let sequence = 0;
beforeAll(async () => {
  configureTestPayu();
  process.env.JWT_SECRET = 'isolated-payu-tests-session-secret';
  process.env.MSG91_WHATSAPP_ENABLED = 'false';
  database = await createTestDatabase(); state.db = database.db;
});
afterEach(() => { vi.unstubAllGlobals(); configureTestPayu(); });
afterAll(async () => { await database.pg.close(); });
type User = typeof schema.users.$inferSelect;
function request(path: string, data: object, user: User) {
  return new Request('http://localhost:3100' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'vpb_token=' + signToken(user) }, body: JSON.stringify(data) });
}
async function fixture() {
  const n = ++sequence;
  const [user] = await database.db.insert(schema.users).values({ name: 'PayU fixture', phone: '970000' + String(n).padStart(4, '0'), passwordHash: 'test-only' }).returning();
  const [product] = await database.db.insert(schema.products).values({ name: 'PayU reel', slug: 'payu-' + n, sku: 'PAYU-' + n, price: 100, stockQuantity: 5 }).returning();
  const body = { idempotencyKey: crypto.randomUUID(), items: [{ id: product.id, qty: 1 }], email: 'fixture@example.com', address: { name: user.name, phone: user.phone, addressLine: 'Test street', city: 'Bareilly', state: 'UP', pincode: '243001' }, total: 1, amount: 1 };
  const response = await create.POST(request('/api/payment/create', body, user));
  expect(response.status).toBe(200);
  const checkout = await response.json() as { orderId: string; action: string; fields: Record<string, string> };
  return { user, product, body, checkout };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function provider(f: Fixture, patch: Record<string, string> = {}) {
  const detail = { txnid: f.checkout.fields.txnid, mihpayid: String(100000 + sequence), amt: '100.00', productinfo: 'VPB order', udf1: f.checkout.orderId,
    status: 'success', unmappedstatus: 'captured', ...patch };
  const fetcher = vi.fn(async () => Response.json({ status: 1, transaction_details: { [f.checkout.fields.txnid]: detail } }));
  vi.stubGlobal('fetch', fetcher); return { detail, fetcher };
}
function callback(f: Fixture, patch: Record<string, string> = {}) {
  const fields: Record<string, string> = { ...f.checkout.fields, status: 'success', mihpayid: String(100000 + sequence), ...patch };
  // Independent, literal documented reverse sequence, rather than production helper.
  fields.hash = createHash('sha512').update(`isolated-payu-merchant-salt|${fields.status}||||||${fields.udf5}|${fields.udf4}|${fields.udf3}|${fields.udf2}|${fields.udf1}|${fields.email}|${fields.firstname}|${fields.productinfo}|${fields.amount}|${fields.txnid}|${fields.key}`).digest('hex');
  return fields;
}
function postCallback(fields: Record<string, string>, path = '/api/payment/payu/webhook') {
  return new Request('http://localhost:3100' + path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', origin: 'https://test.payu.in' }, body: new URLSearchParams(fields) });
}
async function saved(f: Fixture) { return (await database.db.select().from(schema.orders).where(eq(schema.orders.id, f.checkout.orderId)))[0]; }

test('documented hash ordering, additional charges, malformed hashes and exact decimal amounts', () => {
  const p = { key: 'k', txnid: 't', amount: '1.00', productinfo: 'p', firstname: 'f', email: 'e' };
  expect(requestHash(p, 's')).toBe(sha512('k|t|1.00|p|f|e|||||||||||s'));
  const r = { ...p, status: 'success', hash: sha512('s|success|||||||||||e|f|p|1.00|t|k') };
  expect(validResponseHash(r, 's')).toBe(true);
  expect(validResponseHash({ ...r, additionalCharges: '0.00', hash: sha512('0.00|s|success|||||||||||e|f|p|1.00|t|k') }, 's')).toBe(true);
  expect(validResponseHash({ ...r, hash: 'a'.repeat(127) }, 's')).toBe(false);
  expect(amountInPaise('12.30')).toBe(1230);
  for (const value of ['1e2', '-1', '0', '1.001', 'Infinity']) expect(() => amountInPaise(value)).toThrow();
});

test('payment readiness checks configuration and schema without exposing secrets or creating attempts', async () => {
  const before = await database.db.select().from(schema.payuAttempts);
  const response = await paymentStatus.GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, provider: 'payu', environment: 'test' });
  expect(await database.db.select().from(schema.payuAttempts)).toHaveLength(before.length);
  process.env.PAYU_ENABLED = 'false';
  const disabled = await paymentStatus.GET();
  expect(disabled.status).toBe(503);
  expect(JSON.stringify(await disabled.json())).not.toContain(process.env.PAYU_MERCHANT_SALT);
});

test('backend pricing and repeated concurrent checkout create one order and one transaction', async () => {
  const f = await fixture();
  const responses = await Promise.all([create.POST(request('/api/payment/create', f.body, f.user)), create.POST(request('/api/payment/create', f.body, f.user))]);
  for (const response of responses) expect((await response.json()).fields.txnid).toBe(f.checkout.fields.txnid);
  expect(f.checkout.fields.amount).toBe('100.00'); expect(f.checkout.action).toBe('https://test.payu.in/_payment');
  expect(JSON.stringify(f.checkout)).not.toContain('isolated-payu-merchant-salt');
  expect((await database.db.select().from(schema.payuAttempts).where(eq(schema.payuAttempts.orderId, f.checkout.orderId)))).toHaveLength(1);
  expect((await saved(f)).paymentStatus).toBe('pending');
  expect(await database.db.select().from(schema.orderNotifications).where(eq(schema.orderNotifications.orderId, f.checkout.orderId))).toHaveLength(0);
  await expect(ensureInvoice(f.checkout.orderId)).rejects.toThrow('verified payment');
});

test('checkout uses the saved customer email when no email is supplied at payment', async () => {
  const f = await fixture();
  await database.db.update(schema.users).set({ email: 'saved@example.com' }).where(eq(schema.users.id, f.user.id));
  const response = await create.POST(request('/api/payment/create', { ...f.body, email: undefined, idempotencyKey: crypto.randomUUID(),
    address: { ...f.body.address, addressLine: 'Another delivery street' } }, f.user));
  expect(response.status).toBe(200);
  expect((await response.json()).fields.email).toBe('saved@example.com');
});

test('delivery details reuse only the current customer profile or previous order email', async () => {
  const f = await fixture(), other = await fixture();
  await database.db.update(schema.orders).set({ customerEmail: 'previous@example.com' }).where(eq(schema.orders.id, f.checkout.orderId));
  await database.db.update(schema.orders).set({ customerEmail: 'other@example.com' }).where(eq(schema.orders.id, other.checkout.orderId));
  const get = () => extra.GET(new Request('http://localhost:3100/api/extra?res=addresses', { headers: { cookie: 'vpb_token=' + signToken(f.user) } }));
  expect((await (await get()).json()).email).toBe('previous@example.com');
  await database.db.update(schema.users).set({ email: 'profile@example.com' }).where(eq(schema.users.id, f.user.id));
  expect((await (await get()).json()).email).toBe('profile@example.com');
});

test('delivery contact saves only a valid email for the authenticated customer and rejects staff', async () => {
  const f = await fixture(), other = await fixture();
  expect((await extra.POST(request('/api/extra', { res: 'checkout_contact', email: 'invalid' }, f.user))).status).toBe(400);
  expect((await extra.POST(request('/api/extra', { res: 'checkout_contact', email: 'contact@example.com', userId: other.user.id }, f.user))).status).toBe(200);
  expect((await database.db.select().from(schema.users).where(eq(schema.users.id, f.user.id)))[0].email).toBe('contact@example.com');
  expect((await database.db.select().from(schema.users).where(eq(schema.users.id, other.user.id)))[0].email).toBeNull();
  await database.db.update(schema.users).set({ role: 'delivery' }).where(eq(schema.users.id, f.user.id));
  expect((await extra.POST(request('/api/extra', { res: 'checkout_contact', email: 'staff@example.com' }, f.user))).status).toBe(403);
});

test('saving a delivery address saves its email; editing another address never changes contact data', async () => {
  const f = await fixture(), other = await fixture();
  const created = await extra.POST(request('/api/extra', { res: 'address', ...f.body.address, email: 'delivery@example.com' }, f.user));
  expect(created.status).toBe(200); const { address } = await created.json();
  expect((await database.db.select().from(schema.users).where(eq(schema.users.id, f.user.id)))[0].email).toBe('delivery@example.com');
  expect((await extra.POST(request('/api/extra', { res: 'address', ...other.body.address, id: address.id, email: 'wrong@example.com' }, other.user))).status).toBe(403);
  expect((await database.db.select().from(schema.users).where(eq(schema.users.id, other.user.id)))[0].email).toBeNull();
});

test('a replayed checkout request after capture returns the original paid order', async () => {
  const f = await fixture();
  const secondTab = { ...f.body, idempotencyKey: crypto.randomUUID() };
  expect((await create.POST(request('/api/payment/create', secondTab, f.user))).status).toBe(200);
  provider(f); await reconcilePayu(f.checkout.fields.txnid);
  const response = await create.POST(request('/api/payment/create', f.body, f.user));
  expect(await (await create.POST(request('/api/payment/create', secondTab, f.user))).json()).toMatchObject({ alreadyPaid: true, orderId: f.checkout.orderId });
  expect(await response.json()).toMatchObject({ ok: true, alreadyPaid: true, orderId: f.checkout.orderId });
  expect(await database.db.select().from(schema.orders).where(eq(schema.orders.userId, f.user.id))).toHaveLength(1);
});

test('captured callback, duplicate webhook, replay and concurrent verification allocate stock/invoice/outbox once', async () => {
  const f = await fixture(); const { fetcher } = provider(f);
  const fields = callback(f);
  const results = await Promise.all([webhook.POST(postCallback(fields)), webhook.POST(postCallback(fields)), verify.POST(request('/api/payment/payu/verify', { orderId: f.checkout.orderId }, f.user))]);
  for (const response of results) expect(response.status).toBe(200);
  expect((await webhook.POST(postCallback(fields))).status).toBe(200);
  expect(await saved(f)).toMatchObject({ paymentStatus: 'paid', orderStatus: 'confirmed', paymentMethod: 'payu', razorpayPaymentId: null });
  expect((await database.db.select().from(schema.products).where(eq(schema.products.id, f.product.id)))[0].stockQuantity).toBe(4);
  for (const table of [schema.orderItems, schema.orderInvoices, schema.orderNotifications]) expect(await database.db.select().from(table).where(eq(table.orderId, f.checkout.orderId))).toHaveLength(1);
  const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://test.payu.in/merchant/postservice?form=2');
  expect(new URLSearchParams(options.body as URLSearchParams).get('hash')).toBe(sha512(`unit-test-key|verify_payment|${f.checkout.fields.txnid}|isolated-payu-merchant-salt`));
});

test.each(['failed', 'usercancelled', 'pending', 'auth'])('provider state %s is never marked paid', async status => {
  const f = await fixture(); provider(f, { status: ['pending'].includes(status) ? 'pending' : status === 'auth' ? 'success' : 'failure', unmappedstatus: status });
  const response = await webhook.POST(postCallback(callback(f)));
  expect(response.status).toBe(200);
  expect((await saved(f)).paymentStatus).toBe(['failed', 'usercancelled'].includes(status) ? 'failed' : 'pending');
  expect(await database.db.select().from(schema.orderNotifications).where(eq(schema.orderNotifications.orderId, f.checkout.orderId))).toHaveLength(0);
});

test.each(['hash', 'amount', 'txnid', 'udf1', 'currency', 'mihpayid'])('tampered callback %s is rejected', async field => {
  const f = await fixture(); provider(f);
  const fields = callback(f, field === 'hash' ? {} : { [field]: field === 'amount' ? '1.00' : field === 'txnid' ? 'f'.repeat(24) : 'tampered' });
  if (field === 'hash') fields.hash = '0'.repeat(128);
  expect((await webhook.POST(postCallback(fields))).status).toBeGreaterThanOrEqual(400);
  expect((await saved(f)).paymentStatus).toBe('pending');
});

test.each([{ amt: '1.00' }, { txnid: 'unrelated' }, { udf1: 'unrelated' }, { currency: 'USD' }])('server verification mismatch is rejected: %j', async patch => {
  const f = await fixture(); provider(f, Object.fromEntries(Object.entries(patch).filter((entry): entry is [string, string] => typeof entry[1] === 'string')));
  expect((await webhook.POST(postCallback(callback(f)))).status).toBe(400);
  expect((await saved(f)).paymentStatus).toBe('pending');
});

test('outage, timeout and unknown provider transaction keep pending and cannot create another attempt', async () => {
  const f = await fixture();
  for (const failure of [new Error('unavailable'), new DOMException('timeout', 'TimeoutError')]) {
    vi.stubGlobal('fetch', vi.fn(async () => { throw failure; }));
    expect((await webhook.POST(postCallback(callback(f)))).status).toBe(503);
    expect((await returned.POST(postCallback(callback(f), '/api/payment/payu/return'))).status).toBe(303);
    expect((await retry.POST(request('/api/payment/retry', { orderId: f.checkout.orderId }, f.user))).status).toBe(503);
  }
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 0, transaction_details: { [f.checkout.fields.txnid]: { status: 'Not Found' } } })));
  expect((await retry.POST(request('/api/payment/retry', { orderId: f.checkout.orderId }, f.user))).status).toBe(409);
  expect((await saved(f)).paymentStatus).toBe('pending');
  expect(await database.db.select().from(schema.payuAttempts).where(eq(schema.payuAttempts.orderId, f.checkout.orderId))).toHaveLength(1);
});

test('retry verifies previous attempt and creates one new transaction only after terminal failure', async () => {
  const f = await fixture(); provider(f, { status: 'failure', unmappedstatus: 'failed' });
  await reconcilePayu(f.checkout.fields.txnid);
  expect(await (await create.POST(request('/api/payment/create', f.body, f.user))).json()).toMatchObject({ needsVerification: true, orderId: f.checkout.orderId });
  const response = await retry.POST(request('/api/payment/retry', { orderId: f.checkout.orderId }, f.user));
  expect(response.status).toBe(200); const next = await response.json();
  expect(next.orderId).toBe(f.checkout.orderId); expect(next.fields.txnid).not.toBe(f.checkout.fields.txnid);
  expect(await database.db.select().from(schema.payuAttempts).where(eq(schema.payuAttempts.orderId, next.orderId))).toHaveLength(2);
  // An old failure delivery cannot fail the current pending attempt.
  await reconcilePayu(f.checkout.fields.txnid);
  expect(await saved(f)).toMatchObject({ payuTxnId: next.fields.txnid, paymentStatus: 'pending' });
});

test('pending retry checks the existing attempt; late failure cannot reverse a capture', async () => {
  const f = await fixture(); provider(f, { status: 'pending', unmappedstatus: 'pending' });
  const response = await retry.POST(request('/api/payment/retry', { orderId: f.checkout.orderId }, f.user));
  const pending = await response.json();
  expect(pending).toMatchObject({ needsVerification: true, orderId: f.checkout.orderId });
  expect(pending).not.toHaveProperty('fields');
  expect(await database.db.select().from(schema.payuAttempts).where(eq(schema.payuAttempts.orderId, f.checkout.orderId))).toHaveLength(1);
  const repeated = await (await create.POST(request('/api/payment/create', f.body, f.user))).json();
  expect(repeated).toEqual({ ok: true, needsVerification: true, orderId: f.checkout.orderId });
  provider(f); await reconcilePayu(f.checkout.fields.txnid);
  provider(f, { status: 'failure', unmappedstatus: 'failed' }); await reconcilePayu(f.checkout.fields.txnid);
  expect((await saved(f)).paymentStatus).toBe('paid');
});

test.each(['failure', 'failed', 'FAILED'])('terminal PayU %s with userCancelled permits a fresh ID on the same order', async status => {
  const f = await fixture(); provider(f, { status, unmappedstatus: 'userCancelled' });
  const result = await reconcilePayu(f.checkout.fields.txnid);
  expect(result.paymentStatus).toBe('failed');
  expect(result.paymentData?.payuVerification).toMatchObject({ status: status.toLowerCase(), state: 'usercancelled' });
  const response = await retry.POST(request('/api/payment/retry', { orderId: f.checkout.orderId }, f.user));
  expect(response.status).toBe(200);
  const next = await response.json();
  expect(next.orderId).toBe(f.checkout.orderId);
  expect(next.fields.txnid).not.toBe(f.checkout.fields.txnid);
  expect(await database.db.select().from(schema.payuAttempts).where(eq(schema.payuAttempts.orderId, f.checkout.orderId))).toHaveLength(2);
});

test.each(['initiated', 'in progress', 'auth', 'pending'])('PayU %s remains pending and never returns a duplicate checkout form', async state => {
  const f = await fixture(); provider(f, { status: state === 'auth' ? 'success' : 'pending', unmappedstatus: state });
  const response = await retry.POST(request('/api/payment/retry', { orderId: f.checkout.orderId }, f.user));
  expect(await response.json()).toEqual({ ok: true, needsVerification: true, orderId: f.checkout.orderId });
  const checked = await (await verify.POST(request('/api/payment/payu/verify', { orderId: f.checkout.orderId }, f.user))).json();
  expect(checked).toMatchObject({ paymentStatus: 'pending', providerState: state });
  expect(await database.db.select().from(schema.payuAttempts).where(eq(schema.payuAttempts.orderId, f.checkout.orderId))).toHaveLength(1);
});

test('a capture discovered during retry returns the paid order without starting another attempt', async () => {
  const f = await fixture(); provider(f);
  const response = await retry.POST(request('/api/payment/retry', { orderId: f.checkout.orderId }, f.user));
  expect(await response.json()).toEqual({ ok: true, alreadyPaid: true, orderId: f.checkout.orderId });
  expect(await database.db.select().from(schema.payuAttempts).where(eq(schema.payuAttempts.orderId, f.checkout.orderId))).toHaveLength(1);
});

test('return uses 303 and revisits resolve via owned order; unauthorized access and admin payment edits are rejected', async () => {
  const f = await fixture(), other = await fixture(); provider(f);
  expect((await verify.POST(request('/api/payment/payu/verify', { orderId: f.checkout.orderId }, other.user))).status).toBe(404);
  expect((await retry.POST(request('/api/payment/retry', { orderId: f.checkout.orderId }, other.user))).status).toBe(404);
  const admin = { ...other.user, role: 'admin' }; await database.db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, admin.id));
  const edit = request('/api/orders/' + f.checkout.orderId, { paymentStatus: 'paid' }, admin);
  expect((await orderApi.PATCH(edit, { params: Promise.resolve({ id: f.checkout.orderId }) })).status).toBe(409);
  // sequence changed when other was created; use provider's reference in callback.
  const response = await returned.POST(postCallback(callback(f), '/api/payment/payu/return'));
  expect(response.status).toBe(303); expect(response.headers.get('location')).toBe('http://localhost:3100/checkout?paymentOrder=' + f.checkout.orderId);
  for (let i = 0; i < 2; i++) expect((await (await verify.POST(request('/api/payment/payu/verify', { orderId: f.checkout.orderId }, f.user))).json()).paymentStatus).toBe('paid');
});

test('same PayU payment cannot be applied to two orders; live checkout remains disabled by default', async () => {
  const f = await fixture(); provider(f, { mihpayid: '999000' }); await reconcilePayu(f.checkout.fields.txnid);
  const other = await fixture(); provider(other, { mihpayid: '999000' });
  await expect(reconcilePayu(other.checkout.fields.txnid)).rejects.toThrow();
  expect((await saved(other)).paymentStatus).toBe('pending');
  process.env.PAYU_ENABLED = 'false';
  expect((await create.POST(request('/api/payment/create', other.body, other.user))).status).toBe(503);
});
