import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, products } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { verifyPaymentSignature } from "@/lib/razorpay";

// Marks order paid ONLY after server-side signature verification.
// Idempotent — if already paid, returns success without double-stock-deduct.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ ok: false, error: "Missing Razorpay response" }, { status: 400 });
    }
    const ok = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!ok) {
      await db.update(orders).set({ paymentStatus: "failed", paymentData: { ...body, reason: "signature_mismatch" }, updatedAt: new Date() }).where(eq(orders.razorpayOrderId, razorpay_order_id));
      return NextResponse.json({ ok: false, error: "Payment verification failed" }, { status: 400 });
    }

    const o = await db.select().from(orders).where(eq(orders.razorpayOrderId, razorpay_order_id));
    if (!o.length) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    const order = o[0];

    if (order.paymentStatus === "paid") {
      return NextResponse.json({ ok: true, orderId: order.id, orderNumber: order.orderNumber, already: true });
    }

    // Final-stock deduct idempotently
    const snap = (order.cartSnapshot as any[]) || [];
    const existingItems = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    if (existingItems.length === 0) {
      for (const it of snap) {
        const p = await db.select().from(products).where(eq(products.id, it.id));
        if (!p.length) continue;
        const nq = Math.max(0, p[0].stockQuantity - it.qty);
        await db.update(products).set({ stockQuantity: nq, stockStatus: nq <= 0 ? "out_of_stock" : "in_stock" }).where(eq(products.id, it.id));
        await db.insert(orderItems).values({
          orderId: order.id, productId: it.id, productName: it.name, productImage: it.image,
          quantity: it.qty, price: it.price,
        });
      }
    }

    await db.update(orders).set({
      paymentStatus: "paid", orderStatus: "confirmed",
      razorpayPaymentId: razorpay_payment_id, razorpaySignature: razorpay_signature,
      paidAt: new Date(),
      paymentData: sql`${orders.paymentData} || ${JSON.stringify({ verifiedAt: new Date().toISOString() })}::jsonb`,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));

    return NextResponse.json({ ok: true, orderId: order.id, orderNumber: order.orderNumber });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
