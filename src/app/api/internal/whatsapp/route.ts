import { timingSafeEqual } from 'node:crypto';
import { safelyProcessOrderNotifications } from '@/lib/order-notifications';
import { isUuid } from '@/lib/http-security';
import { msg91Config, inspectMsg91Template, inspectMsg91Delivery } from '@/lib/msg91';
import { db } from '@/db';
import { orderNotifications, orders } from '@/db/schema';
import { eq } from 'drizzle-orm';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// Scheduler credential is separate from both the MSG91 key and customer sessions.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(req.headers.get('authorization') || '');
  const expected = Buffer.from('Bearer ' + (secret || ''));
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const orderId = new URL(req.url).searchParams.get('orderId');
  if (orderId !== null && !isUuid(orderId)) return Response.json({ ok: false, error: 'Invalid order ID' }, { status: 400 });
  if (new URL(req.url).searchParams.get('diagnose') === 'true') {
    const config = msg91Config();
    if (!config) return Response.json({ configured: false }, { headers: { 'Cache-Control': 'no-store' } });
    const template = await inspectMsg91Template(config);
    let delivery;
    if (orderId) {
      const [notification] = await db.select({ requestId: orderNotifications.providerRequestId, name: orders.customerName, phone: orders.customerPhone }).from(orderNotifications).innerJoin(orders, eq(orderNotifications.orderId, orders.id)).where(eq(orderNotifications.orderId, orderId));
      if (notification?.requestId) delivery = await inspectMsg91Delivery(config, notification.requestId, [notification.name || '', notification.phone || '']);
    }
    return Response.json({ configured: true, templateName: config.name, language: config.language, variableOrder: config.variables, template, delivery }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const result = await safelyProcessOrderNotifications(orderId ?? undefined);
  return Response.json(result, { status: 'error' in result ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
}
