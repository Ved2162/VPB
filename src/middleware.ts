import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require login
const PROTECTED = ["/account", "/checkout"];
// Routes that require admin role
const ADMIN_ROUTES = ["/admin"];
// Routes that redirect away when already logged in
const AUTH_ROUTES = ["/login", "/register"];

// Lightweight JWT payload decode — NO signature verification here.
// Security: the actual verification still happens in every API route
// via getUserFromHeader() → verifyToken() (full Node.js jsonwebtoken).
// Middleware only needs to know if a token cookie EXISTS and what role
// it claims, so we can redirect before the page renders. The server
// routes re-verify and reject any tampered token before touching data.
function decodeJwtPayload(token: string): { role?: string; exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // Base64url → Base64
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64);
    const payload = JSON.parse(json);
    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("vpb_token")?.value;
  const payload = token ? decodeJwtPayload(token) : null;
  const isLoggedIn = !!payload;
  const isAdmin = payload?.role === "admin";

  // --- Redirect logged-in users away from /login and /register ---
  if (AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL(isAdmin ? "/admin" : "/account", req.url));
    }
    return NextResponse.next();
  }

  // --- Protect /account, /checkout ---
  if (PROTECTED.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    if (!isLoggedIn) {
      const url = new URL("/login", req.url);
      url.searchParams.set("back", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // --- Protect /admin ---
  if (ADMIN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    // /admin/login: let unauthenticated through; redirect admin away
    if (pathname === "/admin/login") {
      if (isAdmin) return NextResponse.redirect(new URL("/admin", req.url));
      return NextResponse.next();
    }
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/register",
    "/account/:path*",
    "/checkout/:path*",
    "/admin/:path*",
  ],
};