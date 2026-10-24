import { db } from '@/db';
import { orderNotifications as notifications, orders } from '@/db/schema';
import { and, eq, inArray, lte, lt, sql } from 'drizzle-orm';
import { indianWhatsAppNumber, msg91Config, sendTemplate, templatePayload, inspectMsg91Template } from './msg91';

export async function processOrderNotifications(orderId?: string) {
  const config = msg91Config();
  if (!config) return { processed: 0, configured: false };
  // A dead worker may have sent its request. Never reclaim it for automatic resend.
  await db.update(notifications).set({ status: 'unknown', errorCode: 'worker_interrupted', updatedAt: new Date() })
    .where(and(eq(notifications.status, 'sending'), lt(notifications.claimedAt, new Date(Date.now() - 5 * 60000))));
  const due = await db.select({ orderId: notifications.orderId }).from(notifications)
    .where(and(inArray(notifications.status, ['pending', 'retry']), lte(notifications.nextAttemptAt, new Date()), orderId ? eq(notifications.orderId, orderId) : undefined))
    .orderBy(notifications.nextAttemptAt).limit(5);
  let processed = 0;
  if (due.length) {
    // MSG91's local Enabled flag does not mean Meta has approved the language.
    // Leave work queued without claiming/sending while approval or lookup is blocked.
    const template = await inspectMsg91Template(config);
    if (!template.ready) {
      await db.update(notifications).set({ errorCode: template.code, nextAttemptAt: new Date(Date.now() + 5 * 60000), updatedAt: new Date() })
        .where(and(inArray(notifications.orderId, due.map(row => row.orderId)), inArray(notifications.status, ['pending', 'retry'])));
      return { processed: 0, configured: true, blocked: template.code };
    }
  }
  for (const candidate of due) {
    // Compare-and-set is atomic across callback, webhook and concurrent cron processes.
    const [claim] = await db.update(notifications).set({ status: 'sending', claimedAt: new Date(), updatedAt: new Date(), attempts: sql`${notifications.attempts} + 1` })
      .where(and(eq(notifications.orderId, candidate.orderId), inArray(notifications.status, ['pending', 'retry']), lte(notifications.nextAttemptAt, new Date()))).returning();
    if (!claim) continue;
    const [order] = await db.select().from(orders).where(eq(orders.id, claim.orderId));
    const phone = indianWhatsAppNumber(order?.customerPhone);
    const eligible = order && order.paymentStatus === 'paid' && order.paidAt && order.razorpayPaymentId && !['placed', 'cancelled', 'rejected'].includes(order.orderStatus) && !order.paymentData?.stockReviewRequired;
    if (!eligible || !phone) {
      await db.update(notifications).set({ status: 'skipped', errorCode: !eligible ? 'order_ineligible' : 'invalid_recipient', updatedAt: new Date() }).where(eq(notifications.orderId, claim.orderId));
      console.info('[whatsapp]', { orderId: claim.orderId, status: 'skipped', code: !eligible ? 'order_ineligible' : 'invalid_recipient' });
      continue;
    }
    const result = await sendTemplate(config, templatePayload(config, order, phone));
    const status = result.status === 'retry' && claim.attempts >= 5 ? 'failed' : result.status;
    await db.update(notifications).set({ status, errorCode: result.code, providerRequestId: result.requestId ?? null,
      acceptedAt: status === 'accepted' ? new Date() : null, updatedAt: new Date(),
      nextAttemptAt: new Date(Date.now() + Math.min(3600, 60 * 2 ** claim.attempts) * 1000),
    }).where(and(eq(notifications.orderId, claim.orderId), eq(notifications.status, 'sending')));
    console.info('[whatsapp]', { orderId: claim.orderId, status, code: result.code });
    processed++;
  }
  return { processed, configured: true };
}

// Background errors never alter the already committed checkout response.
export async function safelyProcessOrderNotifications(orderId?: string) {
  try { return await processOrderNotifications(orderId); }
  catch { console.error('[whatsapp]', { code: 'worker_failed' }); return { processed: 0, error: 'worker_failed' }; }
}
