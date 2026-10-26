import { db } from '@/db';
import { orders } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { activeUser, deliveryFailure, rateLimit } from '@/lib/delivery-server';
import { isUuid, readJson } from '@/lib/http-security';
import { sameOrigin, DeliveryError } from '@/lib/shipment-rules';
import { reconcilePayu } from '@/lib/payu-payments';
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
    const verified = ['paid', 'refunded'].includes(order.paymentStatus) ? order : await reconcilePayu(order.payuTxnId);
    return Response.json({ ok: true, orderId: order.id, paymentStatus: verified.paymentStatus, providerState: verified.paymentData?.payuVerification?.txnid === verified.payuTxnId ? verified.paymentData.payuVerification.state : null });
  } catch (error) { return deliveryFailure(error); }
}
