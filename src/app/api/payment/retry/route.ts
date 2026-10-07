import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeader } from "@/lib/auth";
import { getRazorpay, inPaise } from "@/lib/razorpay";

// Retry failed payment on the same order (preserves order number & cart snapshot)
export async function POST(req: Request) {
  try {
    const me = getUserFromHeader(req);
    if (!me) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
    const body = await req.json();
    const { orderId } = body;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId || "")) {
      return NextResponse.json({ ok: false, error: "Invalid order" }, { status: 400 });
    }
    const o = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!o.length || o[0].userId !== me.id) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    if (o[0].paymentStatus === "paid") return NextResponse.json({ ok: false, error: "Order already paid" }, { status: 400 });

    const rzp = getRazorpay();
    if (!rzp) return NextResponse.json({ ok: false, error: "Razorpay not configured" }, { status: 500 });

    // Reset state for retry
    await db.update(orders).set({ paymentStatus: "pending", paymentData: {}, updatedAt: new Date() }).where(eq(orders.id, o[0].id));

    let rzId = o[0].razorpayOrderId;
    if (!rzId) {
      const rzOrder = await rzp.orders.create({
        amount: inPaise(o[0].total),
        currency: "INR",
        receipt: o[0].orderNumber.slice(0, 40),
        notes: { orderDbId: o[0].id, retry: "1" },
      });
      await db.update(orders).set({ razorpayOrderId: rzOrder.id }).where(eq(orders.id, o[0].id));
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
