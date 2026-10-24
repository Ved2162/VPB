import { db } from '@/db';
import { orders } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { DeliveryError } from './shipment-rules';

type Refund = { paymentId: string; orderId?: string; refundId?: string; amount: number; currency: string; cumulative?: boolean; paymentAmount?: number };
// Signed refund events may be duplicated, partial, or delivered before capture.
// Keep their ledger on the locked order; never rewrite issued receipt snapshots.
export async function recordRefund(refund: Refund) {
  if (!/^pay_[A-Za-z0-9_]{1,75}$/.test(refund.paymentId) || refund.currency !== 'INR' || !Number.isSafeInteger(refund.amount) || refund.amount <= 0 ||
      (!refund.cumulative && !/^rfnd_[A-Za-z0-9_]{1,75}$/.test(refund.refundId || ''))) throw new DeliveryError('Invalid refund event');
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(refund.orderId ? eq(orders.razorpayOrderId, refund.orderId) : eq(orders.razorpayPaymentId, refund.paymentId)).for('update');
    if (!order) throw new DeliveryError('Refund order is not available yet', 409);
    if (refund.paymentAmount !== undefined && refund.paymentAmount !== order.total * 100) throw new DeliveryError('Refund payment amount mismatch');
    if (order.razorpayPaymentId && order.razorpayPaymentId !== refund.paymentId) throw new DeliveryError('Refund payment does not match the order', 409);
    const data = order.paymentData || {};
    const ledger = { ...(data.processedRefunds || {}) } as Record<string, number>;
    let gatewayAmount = Number(data.gatewayRefundedAmount || 0);
    if (refund.cumulative) gatewayAmount = Math.max(gatewayAmount, refund.amount);
    else {
      const previous = ledger[refund.refundId!];
      if (previous !== undefined && previous !== refund.amount) throw new DeliveryError('Conflicting refund event', 409);
      ledger[refund.refundId!] = refund.amount;
    }
    const total = Math.max(gatewayAmount, Object.values(ledger).reduce((sum, value) => sum + value, 0));
    if (!Number.isSafeInteger(total) || total > order.total * 100) throw new DeliveryError('Refund amount exceeds the order');
    await tx.update(orders).set({ paymentStatus: total === order.total * 100 ? 'refunded' : order.paymentStatus,
      razorpayPaymentId: order.razorpayPaymentId || refund.paymentId,
      paymentData: { ...data, processedRefunds: ledger, gatewayRefundedAmount: gatewayAmount, refundedAmount: total }, updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    return { orderId: order.id, refundedAmount: total };
  });
}
