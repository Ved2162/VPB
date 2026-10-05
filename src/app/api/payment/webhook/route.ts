import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyWebhookSignature, inRupees } from "@/lib/razorpay";

// Idempotent webhook handler for payment.authorized / payment.captured / payment.failed etc.
// Uses raw body for signature verification — ensure Node.js runtime + raw body consumption.
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const sig = req.headers.get("x-razorpay-signature") || "";
    const raw = await req.text();
    const valid = verifyWebhookSignature(raw, sig);
    if (!valid) {
      return NextResponse.json({ ok: false, error: "Invalid webhook signature" }, { status: 400 });
    }
    let event: any;
    try { event = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

    const payload = event.payload?.payment?.entity || event.payload?.order?.entity;
    if (!payload) return NextResponse.json({ ok: true });
    const rzOrderId = payload.order_id || payload.id;
    const paymentId = payload.id && payload.entity === "payment" ? payload.id : null;

    const found = await db.select().from(orders).where(eq(orders.razorpayOrderId, rzOrderId));
    if (!found.length) return NextResponse.json({ ok: true, ack: "order_not_found" });
    const order = found[0];

    const evt = event.event;
    if ((evt === "payment.authorized" || evt === "payment.captured") && order.paymentStatus !== "paid") {
      // Idempotent — only process once
      const existingItems = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      if (existingItems.length === 0) {
        const snap = (order.cartSnapshot as any[]) || [];
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
        razorpayPaymentId: paymentId || order.razorpayPaymentId,
        razorpayWebhookVerified: true,
        paidAt: order.paidAt || new Date(),
        paymentMethod: payload.method || order.paymentMethod,
        paymentData: { ...(order.paymentData as any), webhookEvent: evt, capturedAmount: inRupees(payload.amount || 0), email: payload.email, contact: payload.contact },
        updatedAt: new Date(),
      }).where(eq(orders.id, order.id));
    }

    if (evt === "payment.failed" && order.paymentStatus !== "paid") {
      await db.update(orders).set({
        paymentStatus: "failed",
        paymentData: { ...(order.paymentData as any), failedAt: new Date().toISOString(), error: payload.error_description || payload.error_code || "failed" },
        updatedAt: new Date(),
      }).where(eq(orders.id, order.id));
    }

    if (evt === "refund.created" || evt === "payment.refunded") {
      await db.update(orders).set({ paymentStatus: "refunded", updatedAt: new Date() }).where(eq(orders.id, order.id));
    }

    return NextResponse.json({ ok: true, received: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
