import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

// Routes that require login (customer)
const PROTECTED = ["/account", "/checkout"];
// Routes that require admin role
const ADMIN_ROUTES = ["/admin"];
// Routes that should redirect AWAY if already logged in
const AUTH_ROUTES = ["/login", "/register"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("vpb_token")?.value;
  const user = token ? verifyToken(token) : null;

  // --- Redirect logged-in users away from /login and /register ---
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    if (user) {
      const dest = user.role === "admin" ? "/admin" : "/account";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  // --- Protect /account, /checkout ---
  if (PROTECTED.some((r) => pathname.startsWith(r))) {
    if (!user) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("back", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // --- Protect /admin routes (server-side role check) ---
  if (ADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
    // Allow /admin/login through (it handles its own redirect after login)
    if (pathname === "/admin/login") {
      if (user?.role === "admin") return NextResponse.redirect(new URL("/admin", req.url));
      return NextResponse.next();
    }
    if (!user || user.role !== "admin") {
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