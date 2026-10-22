import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from './database';
import * as schema from '../src/db/schema';
import { signToken } from '../src/lib/auth';
import { COURIERS, officialTrackingUrl } from '../src/lib/couriers';
import { trackingUrl } from '../src/lib/shipment-rules';
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/db', () => ({ get db() { return state.db; } }));
import * as shipment from '../src/app/api/delivery/shipments/[id]/route';
import * as detail from '../src/app/api/orders/[id]/route';
import * as history from '../src/app/api/orders/route';
import * as settings from '../src/app/api/delivery/settings/route';
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let admin: typeof schema.users.$inferSelect, customer: typeof admin, other: typeof admin, staff: typeof admin;
beforeAll(async () => {
  process.env.JWT_SECRET = 'isolated-courier-test-secret-never-production';
  database = await createTestDatabase(); state.db = database.db;
  [admin, customer, other, staff] = await database.db.insert(schema.users).values([
    { name: 'Admin', phone: '9001000001', passwordHash: 'unused', role: 'admin' },
    { name: 'Customer', phone: '9001000002', passwordHash: 'unused' },
    { name: 'Other', phone: '9001000003', passwordHash: 'unused' },
    { name: 'Staff', phone: '9001000004', passwordHash: 'unused', role: 'delivery' },
  ]).returning();
  await database.db.insert(schema.deliveryStaff).values({ userId: staff.id, allOrders: false });
});
afterAll(async () => { await database?.pg.close(); });
function req(user: typeof admin, path: string, body?: object) {
  return new Request('http://localhost' + path, { method: body ? 'PATCH' : 'GET', headers: { cookie: 'vpb_token=' + signToken(user), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
for (const courier of COURIERS) test(`${courier.name}: persisted staff edits, customer isolation and no notification/invoice side effects`, async () => {
  const [order] = await database.db.insert(schema.orders).values({ userId: customer.id, orderNumber: courier.name, subtotal: 100, total: 100, paymentStatus: 'paid' }).returning();
  const context = { params: Promise.resolve({ id: order.id }) };
  const path = '/api/delivery/shipments/' + order.id;
  const [provider] = await database.db.select().from(schema.deliveryProviders).where(eq(schema.deliveryProviders.name, courier.name));
  const patch = (body: object, actor = admin) => shipment.PATCH(req(actor, path, body), context);
  expect((await patch({ version: 0, providerId: provider.id })).status).toBe(400);
  expect((await patch({ version: 0, docketNumber: '123' })).status).toBe(400);
  expect((await patch({ version: 0, providerId: 'invalid', docketNumber: '123' })).status).toBe(400);
  expect((await patch({ version: 0, providerId: provider.id, docketNumber: '123', trackingUrl: 'https://evil.com' })).status).toBe(400);
  expect((await patch({ version: 0, providerId: provider.id, docketNumber: '123' }, customer)).status).toBe(403);
  expect((await patch({ version: 0, providerId: provider.id, docketNumber: '123' }, staff)).status).toBe(404);
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  try {
    expect((await patch({ version: 0, providerId: provider.id, docketNumber: 'TEST-001', assignedTo: staff.id, status: 'ASSIGNED' })).status).toBe(200);
    expect((await patch({ version: 1, docketNumber: 'TEST /_002' }, staff)).status).toBe(200);
    // A repeated identical save is idempotent, including the status history.
    expect((await patch({ version: 1, docketNumber: 'TEST /_002' }, staff)).status).toBe(200);
    const [saved] = await database.db.select().from(schema.shipments).where(eq(schema.shipments.orderId, order.id));
    expect(saved).toMatchObject({ courierName: courier.name, docketNumber: 'TEST /_002', version: 2, trackingUrl: courier.baseUrl + '?awb=TEST%20%2F_002' });
    const response = await detail.GET(req(customer, '/api/orders/' + order.id), context);
    expect((await response.json()).order.shipment).toMatchObject({ courierName: courier.name, docketNumber: 'TEST /_002', trackingUrl: saved.trackingUrl, status: 'ASSIGNED' });
    const list = await (await history.GET(req(customer, '/api/orders'))).json();
    expect(list.orders.find((o: { id: string }) => o.id === order.id).shipment.docketNumber).toBe('TEST /_002');
    expect((await detail.GET(req(other, '/api/orders/' + order.id), context)).status).toBe(404);
    expect((await (await history.GET(req(other, '/api/orders?all=1'))).json()).orders).toEqual([]);
    expect(await database.db.select().from(schema.shipmentHistory).where(eq(schema.shipmentHistory.orderId, order.id))).toHaveLength(2);
    expect(await database.db.select().from(schema.orderNotifications)).toHaveLength(0);
    expect(await database.db.select().from(schema.orderInvoices)).toHaveLength(0);
    expect((await database.db.select().from(schema.orders).where(eq(schema.orders.id, order.id)))[0]).toMatchObject({ paymentStatus: 'paid', orderStatus: 'placed' });
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { fetchSpy.mockRestore(); }
});
test('provider names, URLs and query parameters have a closed allowlist', async () => {
  for (const name of ['Unknown', '__proto__', 'Shree Maruti Courier']) {
    expect(officialTrackingUrl(name, '123')).toBe('');
    expect((await settings.POST(req(admin, '/api/delivery/settings', { resource: 'provider', name, trackingUrl: COURIERS[0].baseUrl, active: true }))).status).toBe(400);
  }
  for (const c of COURIERS) {
    expect(officialTrackingUrl(c.name, '')).toBe('');
    expect(officialTrackingUrl(c.name, '123&redirect=evil')).toBe('');
    for (const suffix of ['?redirect=https://evil.com', '?awb=123&next=evil', 'evil', '#evil']) expect(() => trackingUrl(c.baseUrl + suffix)).toThrow();
  }
});
