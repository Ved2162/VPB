import { finalizePayment } from '@/lib/payment-finalization';
import { sameOrigin, DeliveryError } from '@/lib/shipment-rules';
import { readJson } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, products } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { fetchGatewayPayment, verifyPaymentSignature } from "@/lib/razorpay";
import { activeUser, deliveryFailure } from '@/lib/delivery-server';

// Marks order paid ONLY after server-side signature verification.
// Idempotent — if already paid, returns success without double-stock-deduct.
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const me = await activeUser(req);
    if (me.role === 'delivery') return NextResponse.json({ ok: false, error: 'Delivery staff cannot manage payments' }, { status: 403 });
    const body = await readJson(req);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ ok: false, error: "Missing Razorpay response" }, { status: 400 });
    }
    const o = await db.select().from(orders).where(and(eq(orders.razorpayOrderId, razorpay_order_id), eq(orders.userId, me.id)));
    if (!o.length) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
    const ok = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Payment verification failed" }, { status: 400 });
    }

    if (!o.length) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    const order = o[0];

    if (order.paymentStatus === "paid") {
      return NextResponse.json({ ok: true, orderId: order.id, orderNumber: order.orderNumber, already: true });
    }

    const payment = await fetchGatewayPayment(razorpay_payment_id);
    if (payment.order_id !== razorpay_order_id || payment.status !== 'captured') throw new DeliveryError('Payment is awaiting capture. Please retry verification shortly.', 409);
    const confirmed = await finalizePayment({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, userId: me.id, amount: Number(payment.amount), currency: payment.currency, method: payment.method, signature: razorpay_signature });
    return NextResponse.json({ ok: true, orderId: order.id, orderNumber: order.orderNumber });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}
