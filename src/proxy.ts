import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "fms_auth"; // keep in sync with src/server/auth/session.ts
const PUBLIC_PATHS = ["/login"];

/**
 * Sends visitors without a session cookie to the sign-in page, and signed-in ones away from it. Only a
 * hint for navigation: every API route checks the session and role itself (an expired cookie gets a 401
 * that clears it, so the way back to /login then works).
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  if (!isPublic && !request.cookies.has(AUTH_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (path === "/login" && request.cookies.has(AUTH_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
