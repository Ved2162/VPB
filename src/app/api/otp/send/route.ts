import { NextResponse } from "next/server";
import { db } from "@/db";
import { otpRequests } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// Normalise: strip everything except digits, keep last 10
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Strip leading 91 if 12 digits starting with 91
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits.slice(-10);
}

function isValidIndianPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

// Cryptographically secure 6-digit OTP
function generateOtp(): string {
  const buf = crypto.randomBytes(4);
  const num = buf.readUInt32BE(0) % 1000000;
  return num.toString().padStart(6, "0");
}

// Simple in-memory rate-limiter keyed by phone (resets on server restart)
// For production-scale, use Redis or DB-backed rate limit
const sendCooldown = new Map<string, number>();
const COOLDOWN_MS = 60 * 1000; // 60 seconds between sends

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const phone = normalisePhone(body.phone || "");

    if (!isValidIndianPhone(phone)) {
      return NextResponse.json({ ok: false, error: "Enter a valid 10-digit Indian mobile number" }, { status: 400 });
    }

    // Rate limit: 1 request per 60 seconds per phone
    const lastSent = sendCooldown.get(phone);
    const now = Date.now();
    if (lastSent && now - lastSent < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - lastSent)) / 1000);
      return NextResponse.json({ ok: false, error: `Please wait ${wait}s before requesting another OTP`, cooldown: wait }, { status: 429 });
    }

    // Invalidate any existing unexpired OTPs for this phone
    await db.update(otpRequests)
      .set({ consumed: true })
      .where(and(eq(otpRequests.phone, phone), eq(otpRequests.consumed, false)));

    // Generate OTP and hash it
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 1 * 60 * 1000); // 1 minute (matches SMS text)

    // Store hash (never plaintext)
    await db.insert(otpRequests).values({ phone, otpHash, expiresAt });

    // Send via Renflair — backend only, API key never touches frontend
    const apiKey = process.env.RENFLAIR_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "SMS service not configured" }, { status: 500 });
    }

        const msgText = encodeURIComponent(`Your VPB signup OTP is ${otp} . Valid for 1 minutes . Do not share with anyone . -VPB`);
    const smsUrl = `https://sms.renflair.in/V1.php?API=${apiKey}&PHONE=${phone}&OTP=${otp}&MESSAGE=${msgText}`;
    let smsOk = false;
    try {
      const smsRes = await fetch(smsUrl, { signal: AbortSignal.timeout(8000) });
      const smsJson = await smsRes.json() as { status?: string; message?: string };
      smsOk = smsJson.status === "SUCCESS";
      if (!smsOk) {
        console.error("[OTP] Renflair rejected:", smsJson.message || "unknown");
      }
    } catch (smsErr: any) {
      console.error("[OTP] Renflair network error:", smsErr.message);
    }

    if (!smsOk) {
      // Clean up the OTP record — don't leave a valid hash if SMS failed
      await db.update(otpRequests)
        .set({ consumed: true })
        .where(and(eq(otpRequests.phone, phone), eq(otpRequests.consumed, false)));
      return NextResponse.json({ ok: false, error: "Failed to send OTP. Please try again." }, { status: 502 });
    }

    // Only set cooldown after successful send
    sendCooldown.set(phone, now);

    // Return masked phone for display only
    const masked = phone.slice(0, 2) + "****" + phone.slice(-4);
    return NextResponse.json({ ok: true, masked, message: `OTP sent to +91 ${masked}` });
  } catch (e: any) {
    console.error("[OTP send]", e.message);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}