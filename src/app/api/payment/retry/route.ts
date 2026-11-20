import { reserveStock } from '@/lib/inventory';
import { sameOrigin, DeliveryError } from '@/lib/shipment-rules';
import { readJson } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, users, payuAttempts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { preparePayuCheckout, reconcilePayu, canRestartPayuCheckout, isRetiredSandboxAttempt, retiredSandboxResult } from '@/lib/payu-payments';
import { payuConfig } from '@/lib/payu';
import { activeUser, deliveryFailure, rateLimit } from '@/lib/delivery-server';
import { payuLog } from '@/lib/payu-log';

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
    const previousAttemptId = body.previousAttemptId;
    if (previousAttemptId !== undefined && (typeof previousAttemptId !== 'string' || !/^[a-f0-9]{24}$/.test(previousAttemptId)))
      throw new DeliveryError('Invalid payment attempt');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId || "")) {
      return NextResponse.json({ ok: false, error: "Invalid order" }, { status: 400 });
    }
    const config = payuConfig(true);
    const [previous] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!previous || previous.userId !== me.id) throw new DeliveryError('Order not found', 404);
    if (previous.payuTxnId) {
      const [attempt] = await db.select().from(payuAttempts).where(eq(payuAttempts.txnId, previous.payuTxnId));
      if (attempt?.orderId === previous.id && isRetiredSandboxAttempt(attempt.environment, config.environment))
        return NextResponse.json(retiredSandboxResult(previous.id), { status: 409 });
    }
    if (previous.payuTxnId && !['paid', 'refunded'].includes(previous.paymentStatus) && (!previousAttemptId || previousAttemptId === previous.payuTxnId)) {
      // Reconcile the previous PayU attempt before allowing a retry.
      // DeliveryErrors (environment mismatch, Not Found, etc.) must propagate — they are
      // security signals. Only network/timeout errors are wrapped into a 503 so the
      // customer sees "PayU temporarily unavailable" instead of a generic 500.
      try {
        await reconcilePayu(previous.payuTxnId);
      } catch (reconcileError) {
        if (reconcileError instanceof DeliveryError) throw reconcileError;
        throw new DeliveryError('PayU is temporarily unavailable. Please try again in a moment.', 503);
      }
    }
    return await db.transaction(async tx => {
    const [account] = await tx.select().from(users).where(eq(users.id, me.id)).for('update');
    if (!account?.active || account.role === 'delivery' || account.sessionVersion !== me.sessionVersion) throw new DeliveryError('Session expired. Please log in again', 401);
    const o = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o.length || o[0].userId !== me.id) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    if (["paid", "refunded"].includes(o[0].paymentStatus)) return NextResponse.json({ ok: true, alreadyPaid: true, orderId: o[0].id });
    // PayU requires a new ID for a new checkout request. Only a freshly
    // verified, unprocessed checkout may be explicitly replaced.
    // The expected attempt prevents double-clicks, replay and other tabs from
    // replacing a newer checkout that this request has never verified.
    const canRestart = previousAttemptId === o[0].payuTxnId && canRestartPayuCheckout(o[0]);
    const changedAttempt = !!previousAttemptId && previousAttemptId !== o[0].payuTxnId;
    if (o[0].payuTxnId && (changedAttempt || o[0].paymentStatus !== 'failed' && !canRestart)) {
      payuLog('retry_blocked', { orderId: o[0].id, txnid: o[0].payuTxnId, status: o[0].paymentStatus });
      const [cntRow] = await tx.select({ n: sql<number>`count(*)::int` }).from(payuAttempts).where(eq(payuAttempts.orderId, o[0].id));
      return NextResponse.json({ ok: true, needsVerification: true, orderId: o[0].id, attemptCount: Number(cntRow?.n || 0) });
    }

    if (o[0].orderStatus !== 'placed') throw new DeliveryError('This order cannot be reopened for payment', 409);

    await reserveStock(tx, o[0].id, o[0].cartSnapshot);
    const checkoutResult = await preparePayuCheckout(tx, o[0], body.email, canRestart ? previousAttemptId : undefined);
    const [countRow] = await tx.select({ n: sql<number>`count(*)::int` }).from(payuAttempts).where(eq(payuAttempts.orderId, o[0].id));
    const attemptCount = Number(countRow?.n || 0);
    return NextResponse.json({ ...checkoutResult, attemptCount });
    });
  } catch (e: any) {
    payuLog('retry_rejected', { httpStatus: e instanceof DeliveryError ? e.status : 500, code: 'retry_unavailable' });
    return deliveryFailure(e);
  }
}
