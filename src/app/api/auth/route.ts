import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, signToken, getUserFromHeader, COOKIE } from "@/lib/auth";

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
  if (!rows.length || !rows[0].active) return NextResponse.json({ ok: true, user: null });
  const { passwordHash: _p, ...safe } = rows[0] as any;
  const res = NextResponse.json({ ok: true, user: safe });

  // Sliding window: re-issue cookie if token expires in less than 7 days
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/vpb_token=([^;]+)/);
  if (m) {
    try {
      const payload = JSON.parse(Buffer.from(m[1].split(".")[1], "base64").toString());
      const sevenDays = 7 * 24 * 60 * 60;
      if (payload.exp && payload.exp - Math.floor(Date.now() / 1000) < sevenDays) {
        const fresh = signToken({ id: rows[0].id, name: rows[0].name, phone: rows[0].phone!, role: rows[0].role });
        setCookie(res, fresh);
      }
    } catch { /* ignore malformed token — verifyToken already validated */ }
  }

  return res;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "register") {
      const { name, password } = body;
      const phone = normalisePhone(body.phone || "");
      if (!name || !phone || !password) return NextResponse.json({ ok: false, error: "Name, phone number and password are required" }, { status: 400 });
      if (!isValidPhone(phone)) return NextResponse.json({ ok: false, error: "Enter a valid phone number (7–15 digits)" }, { status: 400 });
      if (password.length < 6) return NextResponse.json({ ok: false, error: "Password must be at least 6 characters" }, { status: 400 });
      const ex = await db.select().from(users).where(eq(users.phone, phone));
      if (ex.length) return NextResponse.json({ ok: false, error: "This phone number is already registered. Please login." }, { status: 400 });
      const ins = await db.insert(users).values({
        name: name.trim(),
        phone,
        email: null,
        passwordHash: await hashPassword(password),
        role: "customer",
        active: true,
      }).returning();
      const token = signToken({ id: ins[0].id, name: ins[0].name, phone: ins[0].phone!, role: ins[0].role });
      const res = NextResponse.json({ ok: true, user: { id: ins[0].id, name: ins[0].name, phone: ins[0].phone, role: ins[0].role }, token });
      setCookie(res, token);
      return res;
    }

    if (action === "login") {
      const { password } = body;
      const phone = normalisePhone(body.phone || "");
      if (!phone || !password) return NextResponse.json({ ok: false, error: "Phone number and password are required" }, { status: 400 });
      const rows = await db.select().from(users).where(eq(users.phone, phone));
      if (!rows.length) return NextResponse.json({ ok: false, error: "No account found with this number" }, { status: 401 });
      if (!rows[0].active) return NextResponse.json({ ok: false, error: "Account disabled. Contact support." }, { status: 403 });
      const ok = await verifyPassword(password, rows[0].passwordHash);
      if (!ok) return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
      const token = signToken({ id: rows[0].id, name: rows[0].name, phone: rows[0].phone!, role: rows[0].role });
      const res = NextResponse.json({ ok: true, user: { id: rows[0].id, name: rows[0].name, phone: rows[0].phone, role: rows[0].role }, token });
      setCookie(res, token);
      return res;
    }

    if (action === "forgot") {
      // Stub — no real SMS reset implemented yet
      return NextResponse.json({ ok: true, message: "Contact support on WhatsApp +91 97273 28905 to reset your password." });
    }

    if (action === "update") {
      const me = getUserFromHeader(req);
      if (!me) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
      const { name } = body;
      await db.update(users).set({ name: name || me.name }).where(eq(users.id, me.id));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
