import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { eq, and, notInArray } from 'drizzle-orm';
import { verifyWebhookSignature } from '@/lib/razorpay';
import { finalizePayment } from '@/lib/payment-finalization';
import { scheduleOrderNotification } from '@/lib/schedule-order-notification';
export const maxDuration = 60;
import { readBody } from '@/lib/http-security';
import { DeliveryError } from '@/lib/shipment-rules';
import { deliveryFailure } from '@/lib/delivery-server';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const raw = await readBody(req);
    if (!verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature') || '')) throw new DeliveryError('Invalid webhook signature', 400);
    let event;
    try { event = JSON.parse(raw); } catch { throw new DeliveryError('Invalid webhook request'); }
    const payment = event.payload?.payment?.entity;
    if (event.event === 'payment.captured' && payment?.order_id) {
      const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.razorpayOrderId, payment.order_id));
      if (order) {
        const confirmed = await finalizePayment({ orderId: payment.order_id, paymentId: payment.id, amount: Number(payment.amount), currency: payment.currency, method: payment.method, webhook: true });
        scheduleOrderNotification(confirmed.order.id);
      }
    } else if (event.event === 'payment.failed' && payment?.order_id) {
      // The condition is evaluated atomically; a late failure cannot overwrite capture.
      await db.update(orders).set({ paymentStatus: 'failed', updatedAt: new Date() }).where(and(eq(orders.razorpayOrderId, payment.order_id), notInArray(orders.paymentStatus, ['paid', 'refunded'])));
    } else if (event.event === 'payment.refunded' && payment?.order_id) {
      await db.update(orders).set({ paymentStatus: 'refunded', updatedAt: new Date() }).where(eq(orders.razorpayOrderId, payment.order_id));
    } else if (event.event === 'refund.processed') {
      const refund = event.payload?.refund?.entity;
      if (refund?.payment_id) await db.update(orders).set({ paymentStatus: 'refunded', updatedAt: new Date() }).where(eq(orders.razorpayPaymentId, refund.payment_id));
    }
    // Authorization alone is not capture. A refund creation alone is not a settled refund.
    return NextResponse.json({ ok: true, received: true });
  } catch (error) { return deliveryFailure(error); }
}
