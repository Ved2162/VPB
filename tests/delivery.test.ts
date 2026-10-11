import { beforeAll, afterAll, describe, expect, test, vi } from 'vitest';
import { createTestDatabase } from './database';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import * as gateway from '../src/lib/razorpay';
import { hashPassword, signToken } from '../src/lib/auth';
import { trackingUrl, validateTransition, SHIPMENT_STATUSES } from '../src/lib/shipment-rules';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/db', () => ({ get db() { return state.db; } }));
import * as settings from '../src/app/api/delivery/settings/route';
import * as login from '../src/app/api/delivery/login/route';
import * as listing from '../src/app/api/delivery/shipments/route';
import * as shipment from '../src/app/api/delivery/shipments/[id]/route';
import * as orderDetail from '../src/app/api/orders/[id]/route';
import * as adminApi from '../src/app/api/admin/route';
import * as createPayment from '../src/app/api/payment/create/route';
import * as verifyPayment from '../src/app/api/payment/verify/route';
import * as failedPayment from '../src/app/api/payment/failed/route';
import * as retryPayment from '../src/app/api/payment/retry/route';
import * as seed from '../src/app/api/seed/route';
import * as productsApi from '../src/app/api/products/route';
import * as adminLogin from '../src/app/api/admin/login/route';

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let admin: typeof schema.users.$inferSelect, customer: typeof schema.users.$inferSelect, other: typeof schema.users.$inferSelect;
let order: typeof schema.orders.$inferSelect, otherOrder: typeof schema.orders.$inferSelect;
let staff: { id: string; name: string; phone: string; active: boolean; allOrders: boolean };
let provider: typeof schema.deliveryProviders.$inferSelect;
const password = 'Isolated-test-password-2026';
function request(user: { id: string; name: string; phone: string; role: string } | null, path: string, body?: object, method = 'POST') {
  return new Request('http://localhost:3100' + path, { method: body ? method : 'GET', headers: { ...(user ? { cookie: 'vpb_token=' + signToken(user) } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const staffUser = () => ({ ...staff, role: 'delivery' });
const context = (id = order.id) => ({ params: Promise.resolve({ id }) });
async function patch(body: object, actor: { id: string; name: string; phone: string; role: string } = staffUser(), id = order.id) { return shipment.PATCH(request(actor, '/api/delivery/shipments/' + id, body, 'PATCH'), context(id)); }
async function version() { return (await database.db.select().from(schema.shipments).where(eq(schema.shipments.orderId, order.id)))[0]?.version || 0; }

beforeAll(async () => {
  process.env.JWT_SECRET = 'isolated-test-jwt-secret-never-used-in-production';
  process.env.RAZORPAY_KEY_SECRET = 'isolated-razorpay-secret';
  database = await createTestDatabase(); state.db = database.db;
  const passwordHash = await hashPassword(password);
  [admin, customer, other] = await database.db.insert(schema.users).values([
    { name: 'Test Admin', username: 'test_admin', phone: '9000000001', passwordHash, role: 'admin' },
    { name: 'Test Customer', phone: '9000000002', passwordHash },
    { name: 'Other Customer', phone: '9000000003', passwordHash },
  ]).returning();
  [order, otherOrder] = await database.db.insert(schema.orders).values([
    { userId: customer.id, orderNumber: 'TEST-001', subtotal: 100, total: 100, paymentStatus: 'paid', customerName: customer.name, customerPhone: customer.phone, shippingAddress: { name: customer.name, addressLine: 'Test street', city: 'Bareilly', pincode: '243001' } },
    { userId: other.id, orderNumber: 'TEST-002', subtotal: 200, total: 200, customerName: other.name, customerPhone: other.phone },
  ]).returning();
  await database.db.insert(schema.orderItems).values({ orderId: order.id, productName: 'Test manjha', quantity: 2, price: 50 });
});
afterAll(async () => { await database?.pg.close(); });

describe('Real PostgreSQL delivery workflow', () => {
  test('main-admin ID login validates passwords and refuses non-admin accounts', async () => {
    const response = await adminLogin.POST(request(null, '/api/admin/login', { username: 'test_admin', password }));
    expect(response.status).toBe(200); expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect((await adminLogin.POST(request(null, '/api/admin/login', { username: 'test_admin', password: 'wrong-password' }))).status).toBe(401);
    expect((await adminLogin.POST(request(null, '/api/admin/login', { username: customer.phone, password }))).status).toBe(401);
  });
  test('admin creates a restricted staff account and provider; no hashes leaked', async () => {
    const response = await settings.POST(request(admin, '/api/delivery/settings', { resource: 'staff', name: 'Test Delivery', phone: '9000000004', password, active: true, allOrders: false }));
    expect(response.status).toBe(200); staff = (await response.json()).staff;
    expect(staff).not.toHaveProperty('passwordHash');
    const courier = await settings.POST(request(admin, '/api/delivery/settings', { resource: 'provider', name: 'Test Courier', trackingUrl: 'https://www.delhivery.com/track', active: true }));
    expect(courier.status).toBe(200); provider = (await courier.json()).provider;
    expect((await database.db.select().from(schema.deliveryAudit)).length).toBe(2);
  });
  test('staff logs in using an httpOnly cookie; customer and wrong password rejected', async () => {
    const response = await login.POST(request(null, '/api/delivery/login', { phone: staff.phone, password }));
    expect(response.status).toBe(200); expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect((await login.POST(request(null, '/api/delivery/login', { phone: staff.phone, password: 'wrong-password' }))).status).toBe(401);
    expect((await login.POST(request(null, '/api/delivery/login', { phone: customer.phone, password }))).status).toBe(401);
  });
  test('anonymous and customer access denied; staff sees no unassigned orders', async () => {
    expect((await listing.GET(request(null, '/api/delivery/shipments'))).status).toBe(401);
    expect((await listing.GET(request(customer, '/api/delivery/shipments'))).status).toBe(403);
    expect((await (await listing.GET(request(staffUser(), '/api/delivery/shipments'))).json()).total).toBe(0);
    expect((await patch({ version: 0, internalNotes: 'not authorized' })).status).toBe(404);
  });
  test('admin assigns an order; delivery staff can persist courier details', async () => {
    expect((await patch({ version: 0, assignedTo: staff.id }, admin)).status).toBe(200);
    const response = await patch({ version: 1, providerId: provider.id, trackingUrl: provider.trackingUrl + '/AWB123', docketNumber: 'AWB123', status: 'ASSIGNED', internalNotes: 'Staff-only note' });
    expect(response.status).toBe(200);
    const data = await (await listing.GET(request(staffUser(), '/api/delivery/shipments'))).json();
    expect(data.total).toBe(1); expect(data.rows[0].docketNumber).toBe('AWB123'); expect(data.rows[0].items[0].quantity).toBe(2);
    expect(data.rows[0]).not.toHaveProperty('paymentData'); expect(data.rows[0]).not.toHaveProperty('razorpaySignature');
    const [saved] = await database.db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(saved.trackingNumber).toBe('AWB123'); expect(saved.paymentStatus).toBe('paid'); expect(saved.orderStatus).toBe('placed');
  });
  test('search, filters, sort, pagination and injection strings are handled', async () => {
    for (const q of ['TEST-001', 'Test Customer', customer.phone, 'AWB123']) {
      const data = await (await listing.GET(request(staffUser(), '/api/delivery/shipments?q=' + encodeURIComponent(q)))).json(); expect(data.total).toBe(1);
    }
    const data = await (await listing.GET(request(admin, '/api/delivery/shipments?pageSize=1&sort=order&direction=desc'))).json();
    expect(data.total).toBe(2); expect(data.rows[0].orderNumber).toBe('TEST-002');
    const page2 = await (await listing.GET(request(admin, '/api/delivery/shipments?pageSize=1&page=2&sort=order&direction=desc'))).json(); expect(page2.rows[0].orderNumber).toBe('TEST-001');
    expect((await (await listing.GET(request(admin, '/api/delivery/shipments?status=ASSIGNED&payment=paid&provider=' + provider.id))).json()).total).toBe(1);
    expect((await (await listing.GET(request(admin, '/api/delivery/shipments?from=2000-01-01&to=2000-01-02'))).json()).total).toBe(0);
    expect((await (await listing.GET(request(admin, '/api/delivery/shipments?q=' + encodeURIComponent("%' OR 1=1 --")))).json()).total).toBe(0);
    for (const query of ['page=0', 'pageSize=500', 'sort=__proto__', 'from=bad', 'status=invalid', 'provider=invalid']) expect((await listing.GET(request(admin, '/api/delivery/shipments?' + query))).status).toBe(400);
  });
  test('rejects unsafe links, illegal transitions, assignment and payment mass assignment', async () => {
    for (const url of ['javascript:alert(1)', 'http://www.delhivery.com', 'https://localhost', 'https://127.0.0.1', 'https://evil.com/track', 'https://user:pass@www.delhivery.com']) expect((await patch({ version: 2, trackingUrl: url })).status).toBe(400);
    expect((await patch({ version: 2, docketNumber: '<script>' })).status).toBe(400);
    expect((await patch({ version: 2, status: 'DELIVERED' })).status).toBe(400);
    expect((await patch({ version: 2, assignedTo: staff.id })).status).toBe(403);
    expect((await patch({ version: 2, paymentStatus: 'paid' })).status).toBe(400);
    expect(await version()).toBe(2);
  });
  test('repeated and concurrent identical saves create one history row; stale edits conflict', async () => {
    const update = { version: 2, status: 'PICKUP_PENDING' };
    const responses = await Promise.all([patch(update), patch(update)]); expect(responses.map(r => r.status)).toEqual([200, 200]);
    const history = await database.db.select().from(schema.shipmentHistory).where(eq(schema.shipmentHistory.orderId, order.id)); expect(history).toHaveLength(3);
    expect((await patch({ version: 2, internalNotes: 'stale edit' })).status).toBe(409);
  });
  test('customer sees only their own sanitized timeline', async () => {
    const response = await orderDetail.GET(request(customer, '/api/orders/' + order.id), context());
    expect(response.status).toBe(200); const data = await response.json(); expect(data.order.shipment.status).toBe('PICKUP_PENDING');
    const serialized = JSON.stringify(data); for (const secret of ['internalNotes', 'actorId', 'actorName', 'Staff-only note', 'razorpaySignature', 'paymentData']) expect(serialized).not.toContain(secret);
    expect((await orderDetail.GET(request(other, '/api/orders/' + order.id), context())).status).toBe(404);
    expect((await orderDetail.GET(request(null, '/api/orders/' + order.id), context())).status).toBe(401);
    expect((await orderDetail.GET(request(staffUser(), '/api/orders/' + order.id), context())).status).toBe(403);
  });
  test('staff cannot operate admin, seed, settings, order-status or payment endpoints', async () => {
    expect((await adminApi.GET(request(staffUser(), '/api/admin'))).status).toBe(403);
    expect((await settings.POST(request(staffUser(), '/api/delivery/settings', { resource: 'staff' }))).status).toBe(403);
    expect((await orderDetail.PATCH(request(staffUser(), '/api/orders/' + order.id, { paymentStatus: 'paid' }, 'PATCH'), context())).status).toBe(403);
    expect((await seed.POST(request(staffUser(), '/api/seed', {}))).status).toBe(403);
    for (const handler of [createPayment.POST, verifyPayment.POST, failedPayment.POST, retryPayment.POST]) expect((await handler(request(staffUser(), '/api/payment/test', {}))).status).toBe(403);
  });
  test('shared access and revocation are controlled by admin, including old JWTs', async () => {
    await settings.POST(request(admin, '/api/delivery/settings', { resource: 'staff', ...staff, allOrders: true }));
    expect((await (await listing.GET(request(staffUser(), '/api/delivery/shipments'))).json()).total).toBe(2);
    await settings.POST(request(admin, '/api/delivery/settings', { resource: 'staff', ...staff, active: false }));
    expect((await listing.GET(request(staffUser(), '/api/delivery/shipments'))).status).toBe(403);
    expect((await patch({ version: 3, status: 'PICKED_UP' })).status).toBe(403);
    await settings.POST(request(admin, '/api/delivery/settings', { resource: 'staff', ...staff, active: true }));
  });
  test('valid transit, failed delivery, retry and completion; terminal states cannot reopen', async () => {
    for (const status of ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      const response = await patch({ version: await version(), status }); expect(response.status).toBe(200);
    }
    expect((await patch({ version: await version(), status: 'IN_TRANSIT' })).status).toBe(400);
    const [saved] = await database.db.select().from(schema.orders).where(eq(schema.orders.id, order.id)); expect(saved.orderStatus).toBe('placed'); expect(saved.paymentStatus).toBe('paid');
  });
  test('provider deactivation prevents new assignments and admin can reassign', async () => {
    await settings.POST(request(admin, '/api/delivery/settings', { resource: 'provider', id: provider.id, name: provider.name, trackingUrl: provider.trackingUrl, active: false }));
    expect((await patch({ version: 0, providerId: provider.id }, admin, otherOrder.id)).status).toBe(400);
    expect((await patch({ version: await version(), assignedTo: null }, admin)).status).toBe(200);
    expect((await shipment.GET(request(staffUser(), '/api/delivery/shipments/' + order.id), context())).status).toBe(404);
  });
  test('CSRF and repeated login attempts are rejected', async () => {
    const crossOrigin = request(admin, '/api/delivery/settings', { resource: 'provider' }); crossOrigin.headers.set('origin', 'https://evil.com');
    expect((await settings.POST(crossOrigin)).status).toBe(403);
    let response!: Response;
    for (let n = 0; n < 11; n++) response = await login.POST(request(null, '/api/delivery/login', { phone: '9000000999', password: 'wrong-password' }));
    expect(response.status).toBe(429);
  });
  test('product management, checkout validation and payment verification retain working behavior', async () => {
    const product = await adminApi.POST(request(admin, '/api/admin', { res: 'product', data: { name: 'Regression kite', price: 100, sku: 'REG-KITE', stockQuantity: 10, active: true } })); expect(product.status).toBe(200);
    expect((await (await productsApi.GET(request(null, '/api/products?q=Regression'))).json()).products.length).toBe(1);
    expect((await createPayment.POST(request(customer, '/api/payment/create', { items: [] }))).status).toBe(400);
    const [pending] = await database.db.insert(schema.orders).values({ userId: customer.id, orderNumber: 'TEST-PAY', subtotal: 100, total: 100, razorpayOrderId: 'order_test_123', cartSnapshot: [] }).returning();
    vi.spyOn(gateway, 'fetchGatewayPayment').mockResolvedValue({ id: 'pay_test_123', order_id: 'order_test_123', amount: 10000, currency: 'INR', status: 'captured', method: 'upi' } as any);
    const body = { razorpay_order_id: 'order_test_123', razorpay_payment_id: 'pay_test_123', razorpay_signature: createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update('order_test_123|pay_test_123').digest('hex') };
    expect((await verifyPayment.POST(request(other, '/api/payment/verify', body))).status).toBe(404);
    expect((await verifyPayment.POST(request(customer, '/api/payment/verify', { ...body, razorpay_signature: 'bad' }))).status).toBe(400);
    expect((await verifyPayment.POST(request(customer, '/api/payment/verify', body))).status).toBe(200);
    expect((await verifyPayment.POST(request(customer, '/api/payment/verify', body))).status).toBe(200);
    expect((await database.db.select().from(schema.orders).where(eq(schema.orders.id, pending.id)))[0].paymentStatus).toBe('paid');
    expect((await adminApi.GET(request(admin, '/api/admin?res=stats'))).status).toBe(200);
  });
  test('only admin can delete staff; assignments are released and history is retained', async () => {
    expect((await settings.DELETE(request(staffUser(), '/api/delivery/settings', { id: staff.id }, 'DELETE'))).status).toBe(403);
    expect((await settings.DELETE(request(customer, '/api/delivery/settings', { id: staff.id }, 'DELETE'))).status).toBe(403);
    expect((await settings.DELETE(request(admin, '/api/delivery/settings', { id: admin.id }, 'DELETE'))).status).toBe(404);
    expect((await patch({ version: await version(), assignedTo: staff.id }, admin)).status).toBe(200);
    const priorHistory = await database.db.select().from(schema.shipmentHistory).where(eq(schema.shipmentHistory.orderId, order.id));
    expect((await settings.DELETE(request(admin, '/api/delivery/settings', { id: staff.id }, 'DELETE'))).status).toBe(200);
    expect(await database.db.select().from(schema.users).where(eq(schema.users.id, staff.id))).toHaveLength(0);
    const [saved] = await database.db.select().from(schema.shipments).where(eq(schema.shipments.orderId, order.id));
    expect(saved.assignedTo).toBeNull(); expect(saved.docketNumber).toBe('AWB123'); expect(saved.status).toBe('DELIVERED');
    expect((await database.db.select().from(schema.shipmentHistory).where(eq(schema.shipmentHistory.orderId, order.id))).length).toBe(priorHistory.length + 1);
    expect((await listing.GET(request(staffUser(), '/api/delivery/shipments'))).status).toBe(403);
  });
});

test('URL and transition rules cover all statuses and unsafe destinations', () => {
  for (const url of ['ftp://example.com', 'https://10.0.0.1', 'https://[::1]', 'https://tracking.local', 'https://www.delhivery.com:8443']) expect(() => trackingUrl(url)).toThrow();
  expect(trackingUrl('https://www.delhivery.com/track?id=123')).toContain('https://www.delhivery.com/');
  for (const status of SHIPMENT_STATUSES) expect(() => validateTransition(status, status)).not.toThrow();
  expect(() => validateTransition('IN_TRANSIT', 'RETURN_TO_ORIGIN')).not.toThrow();
  expect(() => validateTransition('ASSIGNED', 'CANCELLED')).not.toThrow();
});
