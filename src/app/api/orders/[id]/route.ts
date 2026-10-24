import { releaseStock } from '@/lib/inventory';
import { finalizePayment } from '@/lib/payment-finalization';
import { scheduleOrderNotification } from '@/lib/schedule-order-notification';
import { officialTrackingUrl } from '@/lib/couriers';
import { sameOrigin, DeliveryError } from '@/lib/shipment-rules';
import { readJson } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, shipments, shipmentHistory, users, deliveryAudit } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { activeUser, rateLimit, deliveryFailure } from "@/lib/delivery-server";

const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const me = await activeUser(req);
    if (me.role === 'delivery') return NextResponse.json({ ok: false, error: 'Use the delivery panel' }, { status: 403 });

    // Query by UUID or order number — never mix them up (UUID query on a non-UUID string throws a Postgres cast error)
    const rows = await db.select().from(orders).where(and(
      isUUID(id) ? eq(orders.id, id) : eq(orders.orderNumber, id),
      me.role === 'admin' ? undefined : eq(orders.userId, me.id),
    ));

    if (!rows.length) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    const o = rows[0];
    if (me?.role !== "admin" && o.userId !== me?.id) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    const [shipment] = await db.select().from(shipments).where(eq(shipments.orderId, o.id));
    const history = await db.select().from(shipmentHistory).where(eq(shipmentHistory.orderId, o.id)).orderBy(desc(shipmentHistory.createdAt), desc(shipmentHistory.id)).limit(200);
    const publicShipment = {
      status: shipment?.status || 'NOT_ASSIGNED', courierName: shipment?.courierName ?? o.courier,
      docketNumber: shipment?.docketNumber ?? o.trackingNumber ?? '', trackingUrl: officialTrackingUrl(shipment?.courierName ?? o.courier, shipment?.docketNumber ?? o.trackingNumber), updatedAt: shipment?.updatedAt || null,
      history: history.map(h => ({ id: h.id, previousStatus: h.before.status, status: h.after.status, courierName: h.after.courierName, docketNumber: h.after.docketNumber, createdAt: h.createdAt })),
    };
    const { razorpaySignature: _signature, paymentData: _paymentData, cartSnapshot: _cart, ...safeOrder } = o;
    return NextResponse.json({ ok: true, order: { ...safeOrder, fulfillmentPending: o.paymentData?.stockReviewRequired === true || o.orderStatus === 'cancelled', items, shipment: publicShipment } });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(req);
    const me = await activeUser(req);
    if (me.role !== 'admin') throw new DeliveryError('Admin only', 403);
    const { id } = await params;
    if (!isUUID(id)) throw new DeliveryError('Invalid order ID');
    await rateLimit('admin-write:' + me.id, 90, 60);
    const body = await readJson(req);
    if (body.trackingNumber !== undefined || body.courier !== undefined) throw new DeliveryError('Use Courier Shipments to update courier details with an audit trail');
    if (Object.keys(body).some(key => !['orderStatus', 'paymentStatus'].includes(key))) throw new DeliveryError('Unsupported order field');
    if (body.orderStatus !== undefined && !['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'].includes(body.orderStatus)) throw new DeliveryError('Invalid order status');
    if (body.paymentStatus !== undefined && !['pending', 'paid', 'failed', 'refunded'].includes(body.paymentStatus)) throw new DeliveryError('Invalid payment status');
    const [before] = await db.select().from(orders).where(eq(orders.id, id));
    if (!before) throw new DeliveryError('Order not found', 404);
    if (before.razorpayOrderId && body.paymentStatus !== undefined && body.paymentStatus !== before.paymentStatus) throw new DeliveryError('Payment status is managed by the verified payment gateway', 409);
    if (body.orderStatus === 'confirmed' && before.paymentData?.stockReviewRequired) {
      if (!before.razorpayOrderId || !before.razorpayPaymentId) throw new DeliveryError('Payment needs manual reconciliation', 409);
      await finalizePayment({ orderId: before.razorpayOrderId, paymentId: before.razorpayPaymentId, amount: before.total * 100, currency: 'INR', reconciledBy: me.id });
      scheduleOrderNotification(before.id);
    }
    return await db.transaction(async tx => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
      if (!order) throw new DeliveryError('Order not found', 404);
      const [actor] = await tx.select().from(users).where(eq(users.id, me.id)).for('share');
      if (!actor?.active || actor.role !== 'admin' || actor.sessionVersion !== me.sessionVersion) throw new DeliveryError('Admin session expired', 401);
      const patch: Partial<typeof orders.$inferInsert> = { updatedAt: new Date() };
      if (body.orderStatus !== undefined) {
        if (!['placed', 'cancelled'].includes(body.orderStatus) && (order.paymentData?.stockReviewRequired || order.razorpayOrderId && (order.paymentStatus !== 'paid' || order.orderStatus === 'cancelled'))) throw new DeliveryError('This order is not available for fulfillment', 409);
        patch.orderStatus = body.orderStatus;
      }
      if (body.paymentStatus !== undefined) {
        if (order.razorpayOrderId && body.paymentStatus !== order.paymentStatus) throw new DeliveryError('Payment status is managed by the verified payment gateway', 409);
        patch.paymentStatus = body.paymentStatus;
      }
      await tx.update(orders).set(patch).where(eq(orders.id, id));
      if (body.orderStatus === 'cancelled') await releaseStock(tx, id);
      await tx.insert(deliveryAudit).values({ actorId: me.id, resource: 'order', resourceId: id, changes: { operation: 'update', fields: Object.keys(body), outcome: 'success' } });
      return NextResponse.json({ ok: true });
    });
  } catch (error) { return deliveryFailure(error); }
}
