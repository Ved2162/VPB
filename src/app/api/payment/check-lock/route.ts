import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { eq, and, inArray, isNotNull } from 'drizzle-orm';
import { activeUser, deliveryFailure } from '@/lib/delivery-server';
import { sameOrigin, DeliveryError } from '@/lib/shipment-rules';

/**
 * Check Checkout Lock Status
 * 
 * This endpoint checks if the authenticated user has any pending payment
 * with an active checkout lock. This is used to enforce the strict checkout
 * lock mechanism where customers cannot initiate new payments while an
 * existing PayU session is unresolved.
 * 
 * Returns:
 * - locked: true if there's an active locked checkout
 * - orderId: the locked order ID
 * - orderNumber: the locked order number
 * - lockedAt: when the lock was activated
 * - paymentStatus: current payment status
 */
export async function GET(req: Request) {
  try {
    sameOrigin(req);
    const me = await activeUser(req);
    if (!me) return NextResponse.json({ ok: false, error: 'Login required', needLogin: true }, { status: 401 });

    // Find any pending order with an active checkout lock
    const lockedOrders = await db.select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      paymentStatus: orders.paymentStatus,
      checkoutLockedAt: orders.checkoutLockedAt,
      payuTxnId: orders.payuTxnId,
    })
      .from(orders)
      .where(and(
        eq(orders.userId, me.id),
        inArray(orders.paymentStatus, ['pending', 'failed']),
        isNotNull(orders.checkoutLockedAt)
      ))
      .orderBy(orders.checkoutLockedAt)
      .limit(1);

    if (lockedOrders.length === 0) {
      return NextResponse.json({
        ok: true,
        locked: false
      });
    }

    const lockedOrder = lockedOrders[0];

    return NextResponse.json({
      ok: true,
      locked: true,
      orderId: lockedOrder.id,
      orderNumber: lockedOrder.orderNumber,
      paymentStatus: lockedOrder.paymentStatus,
      lockedAt: lockedOrder.checkoutLockedAt,
      hasTxnId: !!lockedOrder.payuTxnId
    });

  } catch (error) {
    return deliveryFailure(error);
  }
}
