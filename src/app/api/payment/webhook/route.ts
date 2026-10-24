import { recordRefund } from '@/lib/refunds';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyWebhookSignature, fetchGatewayPayment } from '@/lib/razorpay';
import { finalizePayment, failPayment } from '@/lib/payment-finalization';
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
        if (!confirmed.order.paymentData?.stockReviewRequired && confirmed.order.orderStatus !== 'cancelled') scheduleOrderNotification(confirmed.order.id);
      }
    } else if (event.event === 'payment.failed' && payment?.order_id) {
      // The condition is evaluated atomically; a late failure cannot overwrite capture.
      await failPayment(payment.order_id);
    } else if (event.event === 'payment.refunded' && payment?.order_id) {
      const [order] = await db.select().from(orders).where(eq(orders.razorpayOrderId, payment.order_id));
      if (order) {
        if (Number(payment.amount) !== order.total * 100) throw new DeliveryError('Refund payment amount mismatch');
        await recordRefund({ paymentId: payment.id, orderId: payment.order_id, currency: payment.currency, amount: payment.amount_refunded, cumulative: true });
      }
    } else if (event.event === 'refund.processed') {
      const refund = event.payload?.refund?.entity;
      if (!refund || refund.status !== 'processed') throw new DeliveryError('Invalid processed refund event');
      const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.razorpayPaymentId, refund.payment_id));
      // A refund can arrive before the capture webhook. Resolve its gateway order
      // without trusting an unrelated payment entity supplied alongside the event.
      const gatewayPayment = !order ? await fetchGatewayPayment(refund.payment_id) : undefined;
      if (gatewayPayment && (gatewayPayment.currency !== 'INR' || gatewayPayment.id !== refund.payment_id)) throw new DeliveryError('Refund payment mismatch');
      await recordRefund({ paymentId: refund.payment_id, orderId: gatewayPayment?.order_id, paymentAmount: gatewayPayment ? Number(gatewayPayment.amount) : undefined, refundId: refund.id, amount: refund.amount, currency: refund.currency });
    }
    // Authorization alone is not capture. A refund creation alone is not a settled refund.
    return NextResponse.json({ ok: true, received: true });
  } catch (error) { return deliveryFailure(error); }
}
