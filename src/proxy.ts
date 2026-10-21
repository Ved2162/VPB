import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { sameOrigin } from "@/lib/shipment-rules";
import { MAX_IMAGE_BYTES } from '@/lib/product-images';

// Routes that require login
const PROTECTED = ["/account", "/checkout"];
// Routes that require admin role
const ADMIN_ROUTES = ["/admin"];
// Routes that redirect away when already logged in
const AUTH_ROUTES = ["/login", "/register"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      try {
        if (pathname !== '/api/payment/webhook') sameOrigin(req);
        const limit = pathname === '/api/admin/images' ? MAX_IMAGE_BYTES : 65536;
        if (Number(req.headers.get('content-length') || 0) > limit) return NextResponse.json({ ok: false, error: 'Request too large' }, { status: 413 });
      } catch { return NextResponse.json({ ok: false, error: 'Cross-origin request rejected' }, { status: 403 }); }
    }
    const res = NextResponse.next(); res.headers.set('Cache-Control', 'no-store'); return res;
  }
  const token = req.cookies.get("vpb_token")?.value;
  const payload = token ? verifyToken(token) : null;
  const isLoggedIn = !!payload;
  const isAdmin = payload?.role === "admin";
  const isDelivery = payload?.role === 'delivery';

  if ((pathname === '/delivery' || pathname.startsWith('/delivery/')) && pathname !== '/delivery/login' && !isAdmin && !isDelivery) {
    return NextResponse.redirect(new URL('/delivery/login', req.url));
  }

  // --- Redirect logged-in users away from /login and /register ---
  if (AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL(isAdmin ? "/admin" : isDelivery ? '/delivery' : "/account", req.url));
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
    "/api/:path*",
    "/login",
    "/register",
    "/account/:path*",
    "/checkout/:path*",
    "/admin/:path*",
    "/delivery/:path*",
  ],
};
