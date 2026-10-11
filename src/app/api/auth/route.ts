import { readJson } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, signToken, getUserFromHeader, COOKIE } from "@/lib/auth";
import { activeUser, rateLimit, deliveryFailure } from '@/lib/delivery-server';
import { sameOrigin, textField, DeliveryError } from '@/lib/shipment-rules';
import { POST as deliveryLogin } from '@/app/api/delivery/login/route';

function setCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,   // 14 days
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

// Normalise phone: strip spaces, dashes, brackets; keep leading + if present
function normalisePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, "").trim();
}

function isValidPhone(phone: string): boolean {
  return /^\+?[0-9]{7,15}$/.test(phone);
}

export async function GET(req: Request) {
  const u = getUserFromHeader(req);
  if (!u) return NextResponse.json({ ok: true, user: null });
  const rows = await db.select().from(users).where(eq(users.id, u.id));
  if (!rows.length || !rows[0].active) {
    const response = NextResponse.json({ ok: true, user: null });
    response.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    return response;
  }
  const { passwordHash: _p, ...safe } = rows[0] as any;
  const res = NextResponse.json({ ok: true, user: safe });

  // Sliding window: re-issue cookie if token expires in less than 7 days
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/vpb_token=([^;]+)/);
  if (m) {
    try {
      const payload = JSON.parse(Buffer.from(m[1].split(".")[1], "base64").toString());
      const sevenDays = 7 * 24 * 60 * 60;
      if (u.role !== rows[0].role || payload.exp && payload.exp - Math.floor(Date.now() / 1000) < sevenDays) {
        const fresh = signToken({ id: rows[0].id, name: rows[0].name, phone: rows[0].phone!, role: rows[0].role });
        setCookie(res, fresh);
      }
    } catch { /* ignore malformed token — verifyToken already validated */ }
  }

  return res;
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await readJson(req);
    const action = body.action as string;

    if (action === "register") {
      return NextResponse.json({ ok: false, error: 'Use mobile OTP verification to create an account' }, { status: 403 });
    }

    if (action === "login") {
      const password = textField(body.password, "password", 72, true);
      const phone = normalisePhone(textField(body.phone, "phone", 20, true));
      await rateLimit("customer-auth:" + phone, 10, 900);
      if (!phone || !password) return NextResponse.json({ ok: false, error: "Phone number and password are required" }, { status: 400 });
      const rows = await db.select().from(users).where(eq(users.phone, phone));
      if (!rows.length) return NextResponse.json({ ok: false, error: "Invalid phone number or password" }, { status: 401 });
      if (rows[0].role === 'admin') throw new DeliveryError('Use the main admin sign-in page', 403);
      if (rows[0].role === 'delivery') return deliveryLogin(new Request(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify({ phone, password }) }));
      if (!rows[0].active) return NextResponse.json({ ok: false, error: "Account disabled. Contact support." }, { status: 403 });
      const ok = await verifyPassword(password, rows[0].passwordHash);
      if (!ok) return NextResponse.json({ ok: false, error: "Invalid phone number or password" }, { status: 401 });
      const token = signToken({ id: rows[0].id, name: rows[0].name, phone: rows[0].phone!, role: rows[0].role });
      const res = NextResponse.json({ ok: true, user: { id: rows[0].id, name: rows[0].name, phone: rows[0].phone, role: rows[0].role } });
      setCookie(res, token);
      return res;
    }

    if (action === "forgot") {
      // Stub — no real SMS reset implemented yet
      return NextResponse.json({ ok: true, message: "Contact support on WhatsApp +91 90811 11697 to reset your password." });
    }

    if (action === "update") {
      const me = await activeUser(req);
      if (!me) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
      const name = textField(body.name, "name", 120, true);
      await rateLimit("profile:" + me.id, 30, 60);
      await db.update(users).set({ name: name || me.name }).where(eq(users.id, me.id));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}

export async function DELETE(req: Request) {
  try { sameOrigin(req); } catch (error) { return deliveryFailure(error); }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
