import { db } from '@/db';
import { orderItems, orders, shipments } from '@/db/schema';
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { deliveryFailure, deliveryUser } from '@/lib/delivery-server';
import { DeliveryError, SHIPMENT_STATUSES, uuid } from '@/lib/shipment-rules';

export async function GET(req: Request) {
  try {
    const me = await deliveryUser(req);
    const p = new URL(req.url).searchParams;
    const page = Number(p.get('page') || 1), pageSize = Number(p.get('pageSize') || 20);
    if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new DeliveryError('Invalid pagination');
    const scope = me.allOrders ? undefined : eq(shipments.assignedTo, me.id);
    const filters = [scope];
    const q = (p.get('q') || '').trim();
    if (q.length > 120) throw new DeliveryError('Search is too long');
    if (q) {
      const term = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
      filters.push(or(ilike(orders.orderNumber, term), ilike(sql`${orders.id}::text`, term), ilike(orders.customerName, term), ilike(orders.customerPhone, term), ilike(shipments.docketNumber, term), ilike(orders.trackingNumber, term)));
    }
    const status = p.get('status');
    if (status) {
      if (!SHIPMENT_STATUSES.includes(status as typeof SHIPMENT_STATUSES[number])) throw new DeliveryError('Invalid shipment status');
      filters.push(eq(sql`coalesce(${shipments.status}, 'NOT_ASSIGNED')`, status));
    }
    if (p.get('provider')) filters.push(eq(shipments.providerId, uuid(p.get('provider'))));
    if (p.get('payment')) {
      if (!['pending', 'paid', 'failed', 'refunded'].includes(p.get('payment')!)) throw new DeliveryError('Invalid payment filter');
      filters.push(eq(orders.paymentStatus, p.get('payment')!));
    }
    for (const key of ['from', 'to']) {
      const value = p.get(key);
      if (!value) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new DeliveryError('Invalid date');
      // Order date filters use the shop timezone (India), with an exclusive next-day end.
      const date = new Date(value + 'T00:00:00+05:30');
      filters.push(key === 'from' ? gte(orders.createdAt, date) : lt(orders.createdAt, new Date(date.getTime() + 86400000)));
    }
    if (p.get('from') && p.get('to') && p.get('from')! > p.get('to')!) throw new DeliveryError('End date must follow start date');
    const sortFields = { date: orders.createdAt, order: orders.orderNumber, customer: orders.customerName, updated: sql`coalesce(${shipments.updatedAt}, ${orders.updatedAt})` };
    const sortKey = p.get('sort') || 'date';
    if (!Object.hasOwn(sortFields, sortKey) || !['asc', 'desc'].includes(p.get('direction') || 'desc')) throw new DeliveryError('Invalid sort');
    const sort = (p.get('direction') === 'asc' ? asc : desc)(sortFields[sortKey as keyof typeof sortFields]);
    const where = and(...filters);
    const countRequest = db.select({ total: sql<number>`count(*)::int` }).from(orders).leftJoin(shipments, eq(shipments.orderId, orders.id)).where(where);
    const rowsRequest = db.select({
      id: orders.id, orderNumber: orders.orderNumber, createdAt: orders.createdAt,
      customerName: orders.customerName, customerPhone: orders.customerPhone, shippingAddress: orders.shippingAddress,
      paymentStatus: orders.paymentStatus, paymentMethod: orders.paymentMethod, orderStatus: orders.orderStatus,
      courier: sql<string | null>`coalesce(${shipments.courierName}, ${orders.courier})`,
      docketNumber: sql<string>`coalesce(${shipments.docketNumber}, ${orders.trackingNumber}, '')`,
      trackingUrl: sql<string>`coalesce(${shipments.trackingUrl}, '')`,
      status: sql<string>`coalesce(${shipments.status}, 'NOT_ASSIGNED')`,
      providerId: shipments.providerId, assignedTo: shipments.assignedTo,
      internalNotes: sql<string>`coalesce(${shipments.internalNotes}, '')`,
      version: sql<number>`coalesce(${shipments.version}, 0)`,
      updatedAt: sql<Date>`coalesce(${shipments.updatedAt}, ${orders.updatedAt} at time zone 'UTC')`,
    }).from(orders).leftJoin(shipments, eq(shipments.orderId, orders.id)).where(where).orderBy(sort, asc(orders.id)).limit(pageSize).offset((page - 1) * pageSize);
    const summaryRequest = db.select({ status: sql<string>`coalesce(${shipments.status}, 'NOT_ASSIGNED')`, count: sql<number>`count(*)::int` }).from(orders).leftJoin(shipments, eq(shipments.orderId, orders.id)).where(scope).groupBy(sql`coalesce(${shipments.status}, 'NOT_ASSIGNED')`);
    const [[count], rows, summary] = await Promise.all([countRequest, rowsRequest, summaryRequest]);
    const items = rows.length ? await db.select({ id: orderItems.id, orderId: orderItems.orderId, productName: orderItems.productName, quantity: orderItems.quantity }).from(orderItems).where(inArray(orderItems.orderId, rows.map(r => r.id))) : [];
    return Response.json({ ok: true, rows: rows.map(row => ({ ...row, items: items.filter(i => i.orderId === row.id) })), total: count.total, page, pageSize, summary });
  } catch (error) { return deliveryFailure(error); }
}
