import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { db } from '@/db';
import { deliveryRateLimits, deliveryStaff, users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getUserFromHeader } from '@/lib/auth';
import { DeliveryError, sameOrigin } from './shipment-rules';
import { readJson } from './http-security';

export async function activeUser(req: Request) {
  const token = getUserFromHeader(req);
  if (!token) throw new DeliveryError('Please log in to continue', 401);
  const [user] = await db.select({ id: users.id, name: users.name, phone: users.phone, role: users.role, active: users.active, sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, token.id));
  if (!user?.active) throw new DeliveryError('Account disabled or unavailable', 403);
  if (user.sessionVersion !== (token.sessionVersion ?? 0)) throw new DeliveryError('Session expired. Please log in again', 401);
  return user;
}
export async function deliveryUser(req: Request, adminOnly = false) {
  const token = getUserFromHeader(req);
  if (!token) throw new DeliveryError('Please log in to continue', 401);
  const [user] = await db.select({ id: users.id, name: users.name, phone: users.phone, role: users.role, active: users.active, sessionVersion: users.sessionVersion, staffId: deliveryStaff.userId, allOrders: deliveryStaff.allOrders }).from(users).leftJoin(deliveryStaff, eq(deliveryStaff.userId, users.id)).where(eq(users.id, token.id));
  if (!user?.active) throw new DeliveryError('Account disabled or unavailable', 403);
  if (user.sessionVersion !== (token.sessionVersion ?? 0)) throw new DeliveryError('Session expired. Please log in again', 401);
  if (user.role === 'admin') return { ...user, allOrders: true };
  if (adminOnly || user.role !== 'delivery') throw new DeliveryError('Not permitted', 403);
  if (!user.staffId) throw new DeliveryError('Delivery access has not been granted', 403);
  return { ...user, allOrders: user.allOrders === true };
}
export async function rateLimit(key: string, limit = 90, windowSeconds = 60) {
  const digest = createHash('sha256').update(key).digest('hex');
  const [row] = await db.insert(deliveryRateLimits).values({ key: digest, count: 1, resetAt: sql`now() + ${windowSeconds} * interval '1 second'` }).onConflictDoUpdate({
    target: deliveryRateLimits.key,
    set: {
      count: sql`case when ${deliveryRateLimits.resetAt} <= now() then 1 else ${deliveryRateLimits.count} + 1 end`,
      resetAt: sql`case when ${deliveryRateLimits.resetAt} <= now() then now() + ${windowSeconds} * interval '1 second' else ${deliveryRateLimits.resetAt} end`,
    },
  }).returning();
  if (row.count > limit) throw new DeliveryError('Too many requests. Please try again shortly.', 429);
}
// Vercel overwrites this header. On other hosts, do not trust client-supplied
// forwarding headers: use a conservative shared bucket until a trusted proxy is configured.
export async function rateLimitSource(req: Request, scope: string, limit: number, seconds: number) {
  const value = process.env.VERCEL === '1' ? req.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() : undefined;
  const address = value && isIP(value) ? value : null;
  await rateLimit(scope + ':source:' + (address || 'unattributed'), address ? limit : limit * 10, seconds);
}
export async function mutation(req: Request, adminOnly = false) {
  sameOrigin(req);
  const user = await deliveryUser(req, adminOnly);
  await rateLimit('write:' + user.id);
  return user;
}
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  return readJson(req);
}
export function deliveryFailure(error: unknown) {
  if (error instanceof DeliveryError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  const code = (error as { code?: string; cause?: { code?: string } })?.cause?.code || (error as {code?: string})?.code;
  if (code === '23505') return Response.json({ ok: false, error: 'That phone number or provider name is already in use' }, { status: 409 });
  console.error('[delivery]', code || 'Unexpected failure');
  return Response.json({ ok: false, error: 'Unable to complete the request. Please retry.' }, { status: 500 });
}
