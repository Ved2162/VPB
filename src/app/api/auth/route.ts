import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, signToken, getUserFromHeader, COOKIE } from "@/lib/auth";

function setCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 14, sameSite: "lax" });
}

export async function GET(req: Request) {
  const u = getUserFromHeader(req);
  if (!u) return NextResponse.json({ ok: true, user: null });
  const rows = await db.select().from(users).where(eq(users.id, u.id));
  if (!rows.length || !rows[0].active) return NextResponse.json({ ok: true, user: null });
  const { passwordHash: _p, ...safe } = rows[0] as any;
  return NextResponse.json({ ok: true, user: safe });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "register") {
      const { name, email, password, phone } = body;
      if (!name || !email || !password) return NextResponse.json({ ok: false, error: "Name, email and password are required" }, { status: 400 });
      if (password.length < 6) return NextResponse.json({ ok: false, error: "Password must be at least 6 characters" }, { status: 400 });
      const ex = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      if (ex.length) return NextResponse.json({ ok: false, error: "Email already registered. Please login." }, { status: 400 });
      const ins = await db.insert(users).values({ name: name.trim(), email: email.toLowerCase().trim(), phone: phone || null, passwordHash: await hashPassword(password), role: "customer", active: true }).returning();
      const token = signToken({ id: ins[0].id, name: ins[0].name, email: ins[0].email, role: ins[0].role });
      const res = NextResponse.json({ ok: true, user: { id: ins[0].id, name: ins[0].name, email: ins[0].email, role: ins[0].role }, token });
      setCookie(res, token);
      return res;
    }

    if (action === "login") {
      const { email, password } = body;
      if (!email || !password) return NextResponse.json({ ok: false, error: "Email and password required" }, { status: 400 });
      const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      if (!rows.length) return NextResponse.json({ ok: false, error: "No account found with this email" }, { status: 401 });
      if (!rows[0].active) return NextResponse.json({ ok: false, error: "Account disabled. Contact support." }, { status: 403 });
      const ok = await verifyPassword(password, rows[0].passwordHash);
      if (!ok) return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
      const token = signToken({ id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role });
      const res = NextResponse.json({ ok: true, user: { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role }, token });
      setCookie(res, token);
      return res;
    }

    if (action === "forgot") {
      const { email } = body;
      const rows = await db.select().from(users).where(eq(users.email, (email || "").toLowerCase().trim()));
      if (!rows.length) return NextResponse.json({ ok: true, message: "If an account exists, reset link sent to " + email });
      return NextResponse.json({ ok: true, message: "Password reset link sent to " + email });
    }

    if (action === "update") {
      const me = getUserFromHeader(req);
      if (!me) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
      const { name, phone } = body;
      await db.update(users).set({ name: name || me.name, phone: phone || null }).where(eq(users.id, me.id));
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
