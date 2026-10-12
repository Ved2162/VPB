import { timingSafeEqual } from 'node:crypto';
import { safelyProcessOrderNotifications } from '@/lib/order-notifications';
import { isUuid } from '@/lib/http-security';
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
  const result = await safelyProcessOrderNotifications(orderId ?? undefined);
  return Response.json(result, { status: 'error' in result ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
}
