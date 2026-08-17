import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const VISITOR_COOKIE = "bls_visitor";
const VISITOR_HEADER = "x-bls-visitor";
const VISITOR_RETENTION_SECONDS = 90 * 24 * 60 * 60;

export function proxy(request: NextRequest) {
  const existing = request.cookies.get(VISITOR_COOKIE)?.value;
  const visitorKey = existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing) ? existing : crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(VISITOR_HEADER, visitorKey);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (visitorKey !== existing) {
    response.cookies.set({
      name: VISITOR_COOKIE,
      value: visitorKey,
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: VISITOR_RETENTION_SECONDS
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"]
};
