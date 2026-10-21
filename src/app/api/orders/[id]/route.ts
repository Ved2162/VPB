import { sameOrigin, DeliveryError } from '@/lib/shipment-rules';
import { readJson } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, shipments, shipmentHistory } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { activeUser, deliveryFailure } from "@/lib/delivery-server";

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
      docketNumber: shipment?.docketNumber ?? o.trackingNumber ?? '', trackingUrl: shipment?.trackingUrl || '', updatedAt: shipment?.updatedAt || null,
      history: history.map(h => ({ id: h.id, previousStatus: h.before.status, status: h.after.status, courierName: h.after.courierName, docketNumber: h.after.docketNumber, createdAt: h.createdAt })),
    };
    const { razorpaySignature: _signature, paymentData: _paymentData, cartSnapshot: _cart, ...safeOrder } = o;
    return NextResponse.json({ ok: true, order: { ...safeOrder, items, shipment: publicShipment } });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(req);
    const me = await activeUser(req);
    if (!me || me.role !== "admin") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
    const { id } = await params;
    const body = await readJson(req);
    const patch: any = { updatedAt: new Date() };
    if (body.trackingNumber !== undefined || body.courier !== undefined) return NextResponse.json({ ok: false, error: 'Use Courier Shipments to update courier details with an audit trail' }, { status: 400 });
    if (body.orderStatus !== undefined) {
      if (!['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'].includes(body.orderStatus)) throw new DeliveryError('Invalid order status');
      patch.orderStatus = body.orderStatus;
    }
    if (body.paymentStatus !== undefined) {
      if (!['pending', 'paid', 'failed', 'refunded'].includes(body.paymentStatus)) throw new DeliveryError('Invalid payment status');
      const [order] = await db.select().from(orders).where(eq(orders.id, id));
      if (!order) throw new DeliveryError('Order not found', 404);
      // Admin can review status, but gateway-backed payments are established by signed confirmation.
      if (order.razorpayOrderId && body.paymentStatus !== order.paymentStatus) throw new DeliveryError('Payment status is managed by the verified payment gateway', 409);
      patch.paymentStatus = body.paymentStatus;
    }
    const [saved] = await db.update(orders).set(patch).where(eq(orders.id, id)).returning({ id: orders.id });
    if (!saved) throw new DeliveryError('Order not found', 404);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}
