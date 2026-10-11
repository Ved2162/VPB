import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { COOKIE, signToken, verifyPassword } from '@/lib/auth';
import { deliveryFailure, jsonBody, rateLimit } from '@/lib/delivery-server';
import { DeliveryError, exactKeys, sameOrigin, textField } from '@/lib/shipment-rules';

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await jsonBody(req);
    exactKeys(body, ['username', 'password']);
    const username = textField(body.username, 'admin ID', 80, true).toLowerCase();
    const password = textField(body.password, 'password', 72, true);
    const [rows] = await Promise.all([
      db.select().from(users).where(and(eq(users.username, username), eq(users.role, 'admin'))),
      rateLimit('admin-login:' + username, 10, 900),
    ]);
    const user = rows[0];
    const valid = await verifyPassword(password, user?.passwordHash || '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
    if (!valid || !user?.active) throw new DeliveryError('Invalid admin ID or password', 401);
    const safe = { id: user.id, name: user.name, phone: user.phone, role: user.role };
    const response = NextResponse.json({ ok: true, user: safe });
    response.cookies.set(COOKIE, signToken(safe), { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production', maxAge: 14 * 86400 });
    return response;
  } catch (error) { return deliveryFailure(error); }
}
