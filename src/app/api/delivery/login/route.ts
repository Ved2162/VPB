import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deliveryStaff, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { COOKIE, signToken, verifyPassword } from '@/lib/auth';
import { deliveryFailure, jsonBody, rateLimit, rateLimitSource } from '@/lib/delivery-server';
import { DeliveryError, exactKeys, sameOrigin, textField } from '@/lib/shipment-rules';

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rateLimitSource(req, 'password-auth', 100, 900);
    const body = await jsonBody(req);
    exactKeys(body, ['phone', 'password']);
    const phone = textField(body.phone, 'phone', 20, true).replace(/[\s\-().]/g, '');
    const password = textField(body.password, 'password', 72, true);
    if (!/^\+?[0-9]{7,15}$/.test(phone)) throw new DeliveryError('Enter a valid phone number');
    const [rows] = await Promise.all([
      db.select({ user: users, permission: deliveryStaff }).from(users).leftJoin(deliveryStaff, eq(deliveryStaff.userId, users.id)).where(eq(users.phone, phone)),
      rateLimit('login:' + phone, 10, 900),
    ]);
    const user = rows[0]?.user;
    // Same bcrypt work and generic error whether or not the account exists.
    const valid = await verifyPassword(password, user?.passwordHash || '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
    if (!valid || !user?.active || !['admin', 'delivery'].includes(user.role)) throw new DeliveryError('Invalid delivery login or account disabled', 401);
    if (user.role === 'delivery') {
      if (!rows[0]?.permission) throw new DeliveryError('Invalid delivery login or account disabled', 401);
    }
    const safe = { id: user.id, name: user.name, phone: user.phone, role: user.role };
    const res = NextResponse.json({ ok: true, user: safe });
    res.cookies.set(COOKIE, signToken({ ...safe, sessionVersion: user.sessionVersion }), { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 14 * 24 });
    return res;
  } catch (error) { return deliveryFailure(error); }
}
