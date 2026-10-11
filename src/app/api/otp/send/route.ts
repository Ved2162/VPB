import { NextResponse } from 'next/server';
import { db } from '@/db';
import { otpRequests, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { rateLimit, deliveryFailure } from '@/lib/delivery-server';
import { readJson, phoneNumber } from '@/lib/http-security';
import { DeliveryError, sameOrigin } from '@/lib/shipment-rules';

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await readJson(req);
    const phone = phoneNumber(body.phone);
    await rateLimit('otp-send-phone:' + phone, 1, 60);
    const apiKey = process.env.RENFLAIR_API_KEY;
    if (!apiKey) throw new DeliveryError('SMS service is temporarily unavailable', 503);
    const [account] = await db.select({ role: users.role, active: users.active }).from(users).where(eq(users.phone, phone));
    if (account && (account.role !== 'customer' || !account.active)) throw new DeliveryError('OTP sign-in is unavailable for this account', 403);
    const otp = randomInt(0, 1000000).toString().padStart(6, '0');
    const otpHash = await bcrypt.hash(otp, 10);
    const record = await db.transaction(async tx => {
      await tx.update(otpRequests).set({ consumed: true }).where(and(eq(otpRequests.phone, phone), eq(otpRequests.consumed, false)));
      return (await tx.insert(otpRequests).values({ phone, otpHash, expiresAt: new Date(Date.now() + 60000) }).returning())[0];
    });
    const query = new URLSearchParams({ API: apiKey, PHONE: phone, OTP: otp, MESSAGE: `Your VPB signup OTP is ${otp}. Valid for 1 minute. Do not share with anyone. -VPB` });
    let sent = false;
    try {
      const response = await fetch('https://sms.renflair.in/V1.php?' + query, { signal: AbortSignal.timeout(8000), cache: 'no-store', redirect: 'error' });
      const result = await response.json();
      sent = response.ok && result.status === 'SUCCESS';
    } catch { /* Do not log URLs, OTPs, provider responses or credentials. */ }
    if (!sent) {
      await db.update(otpRequests).set({ consumed: true }).where(eq(otpRequests.id, record.id));
      throw new DeliveryError('Failed to send OTP. Please retry after one minute.', 502);
    }
    const masked = phone.slice(0, 2) + '****' + phone.slice(-4);
    return NextResponse.json({ ok: true, masked, message: `OTP sent to +91 ${masked}` });
  } catch (error) { return deliveryFailure(error); }
}
