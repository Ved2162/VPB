import { db } from '@/db';
import { orders, payuAttempts } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { activeUser, deliveryFailure, rateLimit } from '@/lib/delivery-server';
import { isUuid, readJson } from '@/lib/http-security';
import { sameOrigin, DeliveryError } from '@/lib/shipment-rules';
import { reconcilePayu, canRestartPayuCheckout, isRetiredSandboxAttempt, retiredSandboxResult } from '@/lib/payu-payments';
import { payuConfig } from '@/lib/payu';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await activeUser(req);
    if (user.role === 'delivery') throw new DeliveryError('Not permitted', 403);
    await rateLimit('payu-verify:' + user.id, 30, 60);
    const { orderId } = await readJson(req);
    if (!isUuid(orderId)) throw new DeliveryError('Invalid order');
    const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, user.id)));
    if (!order?.payuTxnId) throw new DeliveryError('Order not found', 404);
    const [attempt] = await db.select().from(payuAttempts).where(and(eq(payuAttempts.txnId, order.payuTxnId), eq(payuAttempts.orderId, order.id)));
    const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(payuAttempts).where(eq(payuAttempts.orderId, order.id));
    const attemptCount = Number(countRow?.n || 0);
    if (isRetiredSandboxAttempt(attempt?.environment, payuConfig().environment))
      return Response.json(retiredSandboxResult(order.id), { status: 409, headers: { 'Cache-Control': 'no-store' } });
    const verified = ['paid', 'refunded'].includes(order.paymentStatus) ? order : await reconcilePayu(order.payuTxnId);
    return Response.json({ ok: true, orderId: order.id, paymentStatus: verified.paymentStatus, attemptCount,
      attemptId: verified.payuTxnId, canRetry: verified.paymentStatus === 'failed' || canRestartPayuCheckout(verified),
      providerState: verified.paymentData?.payuVerification?.txnid === verified.payuTxnId ? verified.paymentData.payuVerification.state : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return deliveryFailure(error); }
}
