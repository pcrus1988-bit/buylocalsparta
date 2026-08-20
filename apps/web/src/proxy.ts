import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MARKETPLACE_COOKIE = "bls_marketplace";
const LEGACY_VISITOR_COOKIE = "bls_visitor";
const VISITOR_HEADER = "x-bls-visitor";
const MARKETPLACE_RETENTION_SECONDS = 31 * 24 * 60 * 60;
const SAFE_VISITOR_KEY = /^[A-Za-z0-9_-]{16,128}$/;

function validVisitor(value: string | undefined): string | undefined {
  return value && SAFE_VISITOR_KEY.test(value) ? value : undefined;
}

function needsPersistentMarketplaceIdentity(pathname: string): boolean {
  const prefixes = [
    "/shop", "/category/", "/product/", "/cart", "/checkout", "/ask-local", "/advice",
    "/login", "/register", "/verify-email", "/forgot-password", "/reset-password", "/account",
    "/vendor", "/admin", "/daily", "/api/"
  ];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function proxy(request: NextRequest) {
  const current = validVisitor(request.cookies.get(MARKETPLACE_COOKIE)?.value);
  const legacy = validVisitor(request.cookies.get(LEGACY_VISITOR_COOKIE)?.value);
  const visitorKey = current ?? legacy ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(VISITOR_HEADER, visitorKey);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const shouldPersist = Boolean(current || legacy || needsPersistentMarketplaceIdentity(request.nextUrl.pathname));
  if (shouldPersist && !current) {
    response.cookies.set({
      name: MARKETPLACE_COOKIE,
      value: visitorKey,
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: MARKETPLACE_RETENTION_SECONDS
    });
  }
  if (request.cookies.has(LEGACY_VISITOR_COOKIE)) {
    response.cookies.set({
      name: LEGACY_VISITOR_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 0
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"]
};
