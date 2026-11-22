import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Server-side session gate.
 *
 * Runs before every matched route, so dashboard pages and private API
 * endpoints are protected on the server - a browser that skips the UI and
 * calls an API directly is rejected the same way. The frontend never decides
 * access on its own.
 */

/** Paths reachable without a session. */
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  // Liveness probe: exposes no data and is used by health checks.
  "/api/v1/health",
]);

function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(normalizePathname(pathname));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let authenticated = false;

  if (token) {
    try {
      authenticated = (await verifySessionToken(token)) !== null;
    } catch (error) {
      // Fails closed: an unusable session secret must not grant access.
      console.error("[auth] Session verification failed:", error);
    }
  }

  if (authenticated) return NextResponse.next();

  // API clients get a JSON 401 instead of an HTML redirect.
  if (normalizePathname(pathname).startsWith("/api/")) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";

  return NextResponse.redirect(loginUrl);
}

export const config = {
  /**
   * Everything except Next.js internals and static assets. `/api` is
   * included on purpose so private endpoints are gated too.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|woff|woff2|ttf)$).*)",
  ],
};
