import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getActivePublicCmsRedirect } from "./lib/public-cms";

const MARKETPLACE_COOKIE = "bls_marketplace";
const LEGACY_VISITOR_COOKIE = "bls_visitor";
const VISITOR_HEADER = "x-bls-visitor";
const MARKETPLACE_RETENTION_SECONDS = 31 * 24 * 60 * 60;
const SAFE_VISITOR_KEY = /^[A-Za-z0-9_-]{16,128}$/;

const REDIRECT_PROTECTED_ROOTS = [
  "/api", "/admin", "/account", "/vendor", "/daily", "/checkout", "/cart",
  "/login", "/register", "/verify-email", "/confirm-email-change", "/forgot-password", "/reset-password"
] as const;

function validVisitor(value: string | undefined): string | undefined {
  return value && SAFE_VISITOR_KEY.test(value) ? value : undefined;
}

function isConsentOrAnalytics(pathname: string): boolean {
  return pathname === "/api/privacy/consent" || pathname.startsWith("/api/analytics/");
}

function needsOperationalPersistence(pathname: string): boolean {
  const routeRoots = [
    "/cart", "/checkout", "/login", "/register", "/verify-email", "/forgot-password", "/reset-password", "/account",
    "/vendor", "/admin", "/daily",
    "/api/checkout", "/api/account", "/api/vendor", "/api/admin", "/api/daily", "/api/payments"
  ];
  return routeRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

function needsSessionContinuity(pathname: string): boolean {
  const routeRoots = ["/shop", "/category", "/product", "/ask-local", "/advice", "/api"];
  return routeRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

function allowsContentRedirect(request: NextRequest): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const pathname = request.nextUrl.pathname;
  if (pathname === "/") return false;
  return !REDIRECT_PROTECTED_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

async function contentRedirectResponse(request: NextRequest): Promise<NextResponse | undefined> {
  if (!allowsContentRedirect(request)) return undefined;
  try {
    const rule = await getActivePublicCmsRedirect(request.nextUrl.pathname);
    if (!rule) return undefined;
    const destination = new URL(rule.toPath, request.url);
    return NextResponse.redirect(destination, rule.statusCode);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "cms.redirect_lookup_failed", path: request.nextUrl.pathname, message: error instanceof Error ? error.message : String(error) }));
    return undefined;
  }
}

export async function proxy(request: NextRequest) {
  const redirected = await contentRedirectResponse(request);
  if (redirected) return redirected;

  const current = validVisitor(request.cookies.get(MARKETPLACE_COOKIE)?.value);
  const legacy = validVisitor(request.cookies.get(LEGACY_VISITOR_COOKIE)?.value);
  const visitorKey = current ?? legacy ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(VISITOR_HEADER, visitorKey);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const pathname = request.nextUrl.pathname;
  const identityNeutral = isConsentOrAnalytics(pathname);
  const persistOperationally = !identityNeutral && needsOperationalPersistence(pathname);
  const persistForSession = !identityNeutral && !persistOperationally && (Boolean(current || legacy) || needsSessionContinuity(pathname));
  if (persistOperationally) {
    response.cookies.set({
      name: MARKETPLACE_COOKIE,
      value: visitorKey,
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: MARKETPLACE_RETENTION_SECONDS
    });
  } else if (persistForSession && !current) {
    response.cookies.set({
      name: MARKETPLACE_COOKIE,
      value: visitorKey,
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/"
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
