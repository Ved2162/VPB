import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, payuAttempts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { activeUser, rateLimit, deliveryFailure } from '@/lib/delivery-server';
import { sameOrigin, DeliveryError } from '@/lib/shipment-rules';
import { readJson, isUuid } from '@/lib/http-security';
import { verifyPayuTransaction } from '@/lib/payu';
import { reconcilePayu } from '@/lib/payu-payments';
import { payuLog } from '@/lib/payu-log';
import { releaseStock } from '@/lib/inventory';

/**
 * Payment Session Cancellation Handler
 * 
 * This endpoint handles the "Leave & Cancel Payment" action when a customer
 * returns to checkout while a PayU payment session is still pending.
 * 
 * IMPORTANT: PayU's cancel_transaction API only works for pre-authorized payments
 * and UPI mandates. For standard hosted checkout payments, we cannot directly
 * cancel a transaction. Instead, we:
 * 
 * 1. Verify the current payment status with PayU
 * 2. If PayU confirms payment succeeded → finalize the order as paid
 * 3. If PayU confirms failure/cancellation → mark order as failed, release stock
 * 4. If PayU shows still pending → keep as pending, inform customer
 * 
 * We NEVER mark a transaction as cancelled solely based on user clicking "Leave".
 * The actual payment state at PayU is the source of truth.
 */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const me = await activeUser(req);
    if (!me) return NextResponse.json({ ok: false, error: 'Login required', needLogin: true }, { status: 401 });
    
    await rateLimit('cancel-session:' + me.id, 10, 60);
    
    const body = await readJson(req);
    const { orderId } = body as { orderId: string };
    
    if (!isUuid(orderId)) {
      throw new DeliveryError('Invalid order ID', 400);
    }

    // Verify the payment status with PayU to determine actual state
    const result = await db.transaction(async tx => {
      // Lock the order to prevent concurrent modifications
      const [order] = await tx.select()
        .from(orders)
        .where(and(
          eq(orders.id, orderId),
          eq(orders.userId, me.id)
        ))
        .for('update');

      if (!order) {
        throw new DeliveryError('Order not found', 404);
      }

      // If already paid or refunded, nothing to cancel
      if (['paid', 'refunded'].includes(order.paymentStatus)) {
        return {
          ok: true,
          status: 'already_paid',
          paymentStatus: order.paymentStatus,
          message: 'Payment was already completed successfully.',
          orderId: order.id,
          orderNumber: order.orderNumber
        };
      }

      // If no PayU transaction ID, this is an error state
      if (!order.payuTxnId) {
        throw new DeliveryError('No payment transaction found for this order', 400);
      }

      const [attempt] = await tx.select()
        .from(payuAttempts)
        .where(eq(payuAttempts.txnId, order.payuTxnId))
        .for('update');

      if (!attempt) {
        throw new DeliveryError('Payment attempt not found', 404);
      }

      // If attempt is already in a terminal state, use that
      if (attempt.status === 'paid') {
        return {
          ok: true,
          status: 'verified_paid',
          paymentStatus: 'paid',
          message: 'Your payment was successfully completed.',
          orderId: order.id,
          orderNumber: order.orderNumber
        };
      }

      if (attempt.status === 'failed' && attempt.verifiedAt) {
        return {
          ok: true,
          status: 'verified_failed',
          paymentStatus: 'failed',
          message: 'Payment session cancelled successfully. You can try again whenever you\'re ready.',
          orderId: order.id,
          orderNumber: order.orderNumber
        };
      }

      // Verify current status with PayU
      payuLog('cancel_session_verify', { orderId: order.id, txnid: order.payuTxnId, requestedBy: me.id });

      return { order, attempt, requiresVerification: true };
    });

    // If terminal state already determined, return immediately
    if (!result.requiresVerification) {
      return NextResponse.json(result);
    }

    // Perform PayU verification outside the transaction (network call)
    try {
      const reconciledOrder = await reconcilePayu(result.attempt.txnId);
      
      // Reload order to get updated status
      const [updatedOrder] = await db.select()
        .from(orders)
        .where(eq(orders.id, result.order.id));

      if (!updatedOrder) {
        throw new DeliveryError('Order not found after verification', 404);
      }

      if (updatedOrder.paymentStatus === 'paid') {
        payuLog('cancel_session_found_paid', { orderId: updatedOrder.id, txnid: result.attempt.txnId });
        return NextResponse.json({
          ok: true,
          status: 'verified_paid',
          paymentStatus: 'paid',
          message: 'Your payment was successfully completed while we were checking.',
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber
        });
      }

      if (updatedOrder.paymentStatus === 'failed') {
        payuLog('cancel_session_confirmed_failed', { orderId: updatedOrder.id, txnid: result.attempt.txnId });
        // Stock already released by reconcilePayu
        // Clear checkout lock explicitly
        await db.update(orders)
          .set({ checkoutLockedAt: null, updatedAt: new Date() })
          .where(eq(orders.id, updatedOrder.id));
        
        return NextResponse.json({
          ok: true,
          status: 'verified_failed',
          paymentStatus: 'failed',
          message: 'Payment session cancelled successfully. You can try again whenever you\'re ready.',
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber
        });
      }

      // Still pending at PayU
      payuLog('cancel_session_still_pending', { orderId: updatedOrder.id, txnid: result.attempt.txnId });
      return NextResponse.json({
        ok: true,
        status: 'still_pending',
        paymentStatus: 'pending',
        message: 'Your payment is still being processed. Please wait while we verify its status.',
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        canRetry: false
      });

    } catch (verificationError) {
      // If verification fails (PayU timeout, network error, etc.)
      payuLog('cancel_session_verify_failed', { 
        orderId: result.order.id, 
        txnid: result.attempt.txnId,
        error: verificationError instanceof Error ? verificationError.message : 'Unknown error'
      });

      return NextResponse.json({
        ok: true,
        status: 'verification_unavailable',
        paymentStatus: 'pending',
        message: 'Unable to verify payment status right now. Please try checking again in a moment, or contact support if this persists.',
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        canRetry: true
      });
    }

  } catch (error) {
    payuLog('cancel_session_error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      httpStatus: error instanceof DeliveryError ? error.status : 500
    });
    return deliveryFailure(error);
  }
}
