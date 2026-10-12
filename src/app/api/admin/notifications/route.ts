import { db } from '@/db';
import { orderNotifications as notifications } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { deliveryUser, mutation, deliveryFailure } from '@/lib/delivery-server';
import { isUuid, readJson } from '@/lib/http-security';
import { DeliveryError } from '@/lib/shipment-rules';
import { scheduleOrderNotification } from '@/lib/schedule-order-notification';
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    await deliveryUser(req, true);
    const orderId = new URL(req.url).searchParams.get('orderId');
    if (orderId && !isUuid(orderId)) throw new DeliveryError('Invalid order ID');
    const rows = await db.select().from(notifications).where(orderId ? eq(notifications.orderId, orderId) : undefined).orderBy(desc(notifications.updatedAt)).limit(100);
    return Response.json({ notifications: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return deliveryFailure(e); }
}

export async function POST(req: Request) {
  try {
    const admin = await mutation(req, true);
    const { orderId, action, providerRequestId } = await readJson(req);
    if (!isUuid(orderId)) throw new DeliveryError('Invalid order ID');
    const [row] = await db.select().from(notifications).where(eq(notifications.orderId, orderId));
    if (!row) throw new DeliveryError('Notification not found', 404);
    const retry = action === 'retry' && ['failed', 'skipped'].includes(row.status);
    const reconciled = action === 'confirmed_not_accepted' && row.status === 'unknown';
    const accepted = action === 'confirmed_accepted' && row.status === 'unknown';
    if (!retry && !reconciled && !accepted) throw new DeliveryError('Notification cannot be retried in this state. Reconcile uncertain outcomes with MSG91 first.', 409);
    if (accepted && (typeof providerRequestId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(providerRequestId))) throw new DeliveryError('Provider request ID required');
    const updated = await db.update(notifications).set({ status: accepted ? 'accepted' : 'pending',
      nextAttemptAt: new Date(), updatedAt: new Date(), errorCode: null,
      resolvedBy: admin.id, resolution: action,
      ...(accepted ? { providerRequestId, acceptedAt: new Date() } : {}),
    }).where(and(eq(notifications.orderId, orderId), eq(notifications.status, row.status))).returning({ orderId: notifications.orderId });
    if (!updated.length) throw new DeliveryError('Notification state changed; reload before retrying', 409);
    if (!accepted) scheduleOrderNotification(orderId);
    return Response.json({ ok: true, status: accepted ? 'accepted' : 'pending' });
  } catch (e) { return deliveryFailure(e); }
}
