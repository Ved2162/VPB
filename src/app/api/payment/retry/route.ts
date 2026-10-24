import { reserveStock } from '@/lib/inventory';
import { sameOrigin, DeliveryError } from '@/lib/shipment-rules';
import { readJson } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeader } from "@/lib/auth";
import { getRazorpay, inPaise } from "@/lib/razorpay";
import { activeUser, deliveryFailure, rateLimit } from '@/lib/delivery-server';

// Retry failed payment on the same order (preserves order number & cart snapshot)
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const me = await activeUser(req);
    if (me.role === 'delivery') return NextResponse.json({ ok: false, error: 'Delivery staff cannot manage payments' }, { status: 403 });
    if (!me) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
    await rateLimit('payment-retry:' + me.id, 20, 60);
    const body = await readJson(req);
    const { orderId } = body;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId || "")) {
      return NextResponse.json({ ok: false, error: "Invalid order" }, { status: 400 });
    }
    return await db.transaction(async tx => {
    const [account] = await tx.select().from(users).where(eq(users.id, me.id)).for('update');
    if (!account?.active || account.role === 'delivery' || account.sessionVersion !== me.sessionVersion) throw new DeliveryError('Session expired. Please log in again', 401);
    const o = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o.length || o[0].userId !== me.id) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    if (["paid", "refunded"].includes(o[0].paymentStatus)) return NextResponse.json({ ok: false, error: "Order already paid" }, { status: 400 });

    if (o[0].orderStatus !== 'placed') throw new DeliveryError('This order cannot be reopened for payment', 409);

    const rzp = getRazorpay();
    if (!rzp) return NextResponse.json({ ok: false, error: "Razorpay not configured" }, { status: 500 });

    await reserveStock(tx, o[0].id, o[0].cartSnapshot);
    // Reset state for retry
    await tx.update(orders).set({ paymentStatus: "pending", updatedAt: new Date() }).where(eq(orders.id, o[0].id));

    let rzId = o[0].razorpayOrderId;
    if (!rzId) {
      const rzOrder = await rzp.orders.create({
        amount: inPaise(o[0].total),
        currency: "INR",
        receipt: o[0].orderNumber.slice(0, 40),
        notes: { orderDbId: o[0].id, retry: "1" },
      });
      await tx.update(orders).set({ razorpayOrderId: rzOrder.id }).where(eq(orders.id, o[0].id));
      rzId = rzOrder.id;
    }

    return NextResponse.json({
      ok: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      order: { id: rzId, amount: inPaise(o[0].total), currency: "INR" },
      amount: o[0].total,
      prefill: { name: o[0].customerName || "", email: "", contact: me.phone },
      existingOrderId: o[0].id,
    });
    });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}
