import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

// JWT_SECRET is read at call time, not module load time,
// so Next.js production build does not require the env var to be present.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

const COOKIE_NAME = "vpb_token";

export type SessionUser = { id: string; name: string; phone: string; role: string };

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}
export function signToken(user: SessionUser) {
  return jwt.sign(user, getJwtSecret(), { expiresIn: "14d" });
}
export function verifyToken(token: string): SessionUser | null {
  try {
    return jwt.verify(token, getJwtSecret()) as SessionUser;
  } catch {
    return null;
  }
}
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const t = store.get(COOKIE_NAME)?.value;
    if (!t) return null;
    return verifyToken(t);
  } catch {
    return null;
  }
}
export function getUserFromHeader(req: Request): SessionUser | null {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/vpb_token=([^;]+)/);
  if (!m) {
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) return verifyToken(auth.slice(7));
    return null;
  }
  try {
    return verifyToken(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}
export const COOKIE = COOKIE_NAME;
export function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
export function orderNumber() {
  const d = new Date();
  const r = Math.floor(1000 + Math.random() * 9000);
  return `VPB-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${r}${Math.floor(Math.random() * 90 + 10)}`;
}
