import { officialTrackingUrl } from '@/lib/couriers';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, products, shipments, shipmentHistory } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { getUserFromHeader, orderNumber } from "@/lib/auth";
import { activeUser, deliveryFailure } from '@/lib/delivery-server';

function publicOrder(order: typeof orders.$inferSelect) {
  const { razorpaySignature: _signature, paymentData: _paymentData, cartSnapshot: _cart, ...safe } = order;
  return safe;
}
export async function GET(req: Request) {
  try {
    const me = await activeUser(req);
    if (me.role === 'delivery') return NextResponse.json({ ok: false, error: 'Use the delivery panel' }, { status: 403 });
    if (!me) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
    const u = new URL(req.url);
    if (u.searchParams.get("all") === "1" && me.role === "admin") {
      const all = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(200);
      return NextResponse.json({ ok: true, orders: all });
    }
    const mine = await db.select().from(orders).where(eq(orders.userId, me.id)).orderBy(desc(orders.createdAt));
    const withItems = await Promise.all(mine.map(async (o) => {
      const [shipment] = await db.select().from(shipments).where(eq(shipments.orderId, o.id));
      const history = await db.select().from(shipmentHistory).where(eq(shipmentHistory.orderId, o.id)).orderBy(desc(shipmentHistory.createdAt), desc(shipmentHistory.id)).limit(200);
      const courierName = shipment?.courierName ?? o.courier;
      const docketNumber = shipment?.docketNumber ?? o.trackingNumber ?? '';
      return { ...publicOrder(o), items: await db.select().from(orderItems).where(eq(orderItems.orderId, o.id)), shipment: {
        status: shipment?.status || 'NOT_ASSIGNED', courierName, docketNumber,
        trackingUrl: officialTrackingUrl(courierName, docketNumber), updatedAt: shipment?.updatedAt || null,
        history: history.map(h => ({ id: h.id, previousStatus: h.before.status, status: h.after.status, courierName: h.after.courierName, docketNumber: h.after.docketNumber, createdAt: h.createdAt })),
      } };
    }));
    return NextResponse.json({ ok: true, orders: withItems });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = getUserFromHeader(req);
    if (!me) return NextResponse.json({ ok: false, error: "Please login to continue", needLogin: true }, { status: 401 });
    // Legacy direct-create disabled; checkout now uses /api/payment/create (Razorpay)
    return NextResponse.json({ ok: false, error: "Use Razorpay flow: POST /api/payment/create" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Unable to complete this request. Please retry." }, { status: 500 });
  }
}
