import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users, otpRequests } from '@/db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { signToken, COOKIE } from '@/lib/auth';
import { rateLimit, deliveryFailure } from '@/lib/delivery-server';
import { readJson, phoneNumber } from '@/lib/http-security';
import { sameOrigin, textField, DeliveryError } from '@/lib/shipment-rules';

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await readJson(req);
    const phone = phoneNumber(body.phone);
    const otp = textField(body.otp, 'OTP', 6, true);
    const name = textField(body.name ?? '', 'name', 120);
    if (!/^\d{6}$/.test(otp)) throw new DeliveryError('OTP must be 6 digits');
    await rateLimit('otp-verify-phone:' + phone, 20, 900);
    // Serialize attempts and consumption: a code cannot be replayed or exceed five guesses.
    const result = await db.transaction(async tx => {
      const [record] = await tx.select().from(otpRequests).where(and(eq(otpRequests.phone, phone), eq(otpRequests.consumed, false), gte(otpRequests.expiresAt, new Date()))).orderBy(desc(otpRequests.createdAt)).limit(1).for('update');
      if (!record) return { error: 'OTP expired or not found. Please request a new OTP.', status: 400 };
      if (record.attempts >= 5) return { error: 'Too many incorrect attempts. Request a new OTP.', status: 429 };
      const valid = await bcrypt.compare(otp, record.otpHash);
      if (!valid) {
        const attempts = record.attempts + 1;
        await tx.update(otpRequests).set({ attempts, consumed: attempts >= 5 }).where(eq(otpRequests.id, record.id));
        return { error: attempts >= 5 ? 'Too many incorrect attempts. Request a new OTP.' : `Incorrect OTP. ${5 - attempts} attempts remaining.`, status: attempts >= 5 ? 429 : 400 };
      }
      const [existing] = await tx.select().from(users).where(eq(users.phone, phone));
      if (existing && (!existing.active || existing.role !== 'customer')) {
        await tx.update(otpRequests).set({ consumed: true }).where(eq(otpRequests.id, record.id));
        return { error: 'Use the appropriate staff or admin sign-in page', status: 403 };
      }
      if (!existing && !name) return { error: 'Name is required for new accounts', status: 400, needName: true };
      const user = existing || (await tx.insert(users).values({ name, phone, email: null, passwordHash: '$otp$' + randomBytes(32).toString('hex'), role: 'customer', active: true }).returning())[0];
      await tx.update(otpRequests).set({ consumed: true }).where(eq(otpRequests.id, record.id));
      return { user: { id: user.id, name: user.name, phone: user.phone!, role: user.role }, isNew: !existing };
    });
    if ('error' in result) return NextResponse.json({ ok: false, error: result.error, needName: result.needName }, { status: result.status });
    const res = NextResponse.json({ ok: true, user: result.user, isNew: result.isNew });
    res.cookies.set(COOKIE, signToken(result.user), { httpOnly: true, path: '/', maxAge: 14 * 86400, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    return res;
  } catch (error) { return deliveryFailure(error); }
}
