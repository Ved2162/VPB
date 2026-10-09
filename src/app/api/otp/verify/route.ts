import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, otpRequests } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signToken, COOKIE } from "@/lib/auth";

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits.slice(-10);
}

function setCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const phone = normalisePhone(body.phone || "");
    const otp = (body.otp || "").toString().trim();
    const name = (body.name || "").trim();

    if (!phone || !otp) {
      return NextResponse.json({ ok: false, error: "Phone and OTP are required" }, { status: 400 });
    }
    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ ok: false, error: "OTP must be 6 digits" }, { status: 400 });
    }

    // Find the latest active OTP record for this phone
    const now = new Date();
    const records = await db.select().from(otpRequests)
      .where(and(
        eq(otpRequests.phone, phone),
        eq(otpRequests.consumed, false),
        gte(otpRequests.expiresAt, now)
      ));

    if (!records.length) {
      return NextResponse.json({ ok: false, error: "OTP expired or not found. Please request a new OTP." }, { status: 400 });
    }

    // Use the most recently created record
    const record = records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    // Limit attempts: max 5 per OTP
    if (record.attempts >= 5) {
      await db.update(otpRequests).set({ consumed: true }).where(eq(otpRequests.id, record.id));
      return NextResponse.json({ ok: false, error: "Too many incorrect attempts. Please request a new OTP." }, { status: 429 });
    }

    // Verify against stored hash
    const valid = await bcrypt.compare(otp, record.otpHash);

    if (!valid) {
      await db.update(otpRequests).set({ attempts: record.attempts + 1 }).where(eq(otpRequests.id, record.id));
      const remaining = 4 - record.attempts;
      return NextResponse.json({
        ok: false,
        error: remaining > 0 ? `Incorrect OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Too many incorrect attempts. Please request a new OTP."
      }, { status: 400 });
    }

    // Mark OTP consumed (single-use)
    await db.update(otpRequests).set({ consumed: true }).where(eq(otpRequests.id, record.id));

    // Find or create user
    const existingRows = await db.select().from(users).where(eq(users.phone, phone));

    let user;
    if (existingRows.length) {
      // Existing customer: load their account, do NOT overwrite name
      user = existingRows[0];
      if (!user.active) {
        return NextResponse.json({ ok: false, error: "Account disabled. Contact support." }, { status: 403 });
      }
    } else {
      // New customer: name is required
      if (!name) {
        return NextResponse.json({ ok: false, error: "Name is required for new accounts", needName: true }, { status: 400 });
      }
      // Create account — passwordHash not used for OTP customers, use a random unusable hash
      const { randomBytes } = await import("crypto");
      const unusableHash = "$otp$" + randomBytes(32).toString("hex");
      const ins = await db.insert(users).values({
        name,
        phone,
        email: null,
        passwordHash: unusableHash,
        role: "customer",
        active: true,
      }).returning();
      user = ins[0];
    }

    // Issue JWT cookie
    const token = signToken({ id: user.id, name: user.name, phone: user.phone!, role: user.role });
    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
      isNew: !existingRows.length,
      token,
    });
    setCookie(res, token);
    return res;
  } catch (e: any) {
    console.error("[OTP verify]", e.message);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}