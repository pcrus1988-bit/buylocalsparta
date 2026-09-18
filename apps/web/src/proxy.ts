import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getActivePublicCmsRedirect } from "./lib/public-cms-redirects";
import { seoDocumentRobotsHeader } from "./lib/seo-request-indexing";

const MARKETPLACE_COOKIE = "bls_marketplace";
const LEGACY_VISITOR_COOKIE = "bls_visitor";
const VISITOR_HEADER = "x-bls-visitor";
const MARKETPLACE_RETENTION_SECONDS = 31 * 24 * 60 * 60;
const SAFE_VISITOR_KEY = /^[A-Za-z0-9_-]{16,128}$/;
const DATABASE_RECOVERY_MODE = process.env.BLS_DATABASE_RECOVERY_MODE === "true";
const DATABASE_RECOVERY_CRON_PATHS = [
  "/api/cron/symphonya-",
  "/api/cron/catalogue-crawler",
  "/api/cron/nova-canonical-media",
  "/api/cron/merchant-sync",
  "/api/cron/merchant-status",
  "/api/cron/pending-payments",
  "/api/cron/order-sla",
  "/api/cron/delivery-dispatch"
] as const;

const REDIRECT_PROTECTED_ROOTS = [
  "/api", "/admin", "/account", "/daily", "/checkout", "/cart", "/choose-location",
  "/login", "/register", "/verify-email", "/confirm-email-change", "/forgot-password", "/reset-password", "/join/apply",
  "/vendor/login", "/vendor/advice", "/vendor/analytics", "/vendor/catalog", "/vendor/daily-access", "/vendor/finance",
  "/vendor/notifications", "/vendor/orders", "/vendor/pickup", "/vendor/reports", "/vendor/returns", "/vendor/shipping",
  "/vendor/storefront", "/vendor/trust"
] as const;

// Core commerce routes are canonical application routes, not CMS vanity paths.
// Keeping them out of the redirect resolver avoids a database/cache lookup in
// middleware before every catalogue/product/vendor render. That lookup becomes
// especially expensive when the database pool is busy with catalogue work.
const CMS_REDIRECT_BYPASS_ROOTS = [
  "/shop", "/shops", "/category", "/product", "/vendor", "/bazaar", "/ask-local", "/advice"
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
  if (CMS_REDIRECT_BYPASS_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`))) return false;
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

function applySeoDocumentHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const robots = seoDocumentRobotsHeader(request.nextUrl.pathname, request.nextUrl.searchParams);
  if (robots) response.headers.set("X-Robots-Tag", robots);
  return response;
}

function databaseRecoveryResponse(request: NextRequest): NextResponse | undefined {
  if (!DATABASE_RECOVERY_MODE) return undefined;
  const pathname = request.nextUrl.pathname;

  // Never involve PostgreSQL for scheduler traffic while the connection pool is
  // recovering. Return success so schedulers do not create retry storms.
  if (DATABASE_RECOVERY_CRON_PATHS.some((path) => pathname === path || pathname.startsWith(path))) {
    return NextResponse.json(
      { ok: true, skipped: "database_recovery_mode" },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }

  // Health probes and immutable/static files do not need the commerce database.
  // Return immediately so they also bypass the CMS redirect lookup while the DB is down.
  if (pathname.startsWith("/api/health") || /\.[A-Za-z0-9]{2,8}$/.test(pathname)) {
    return NextResponse.next();
  }

  // Emergency circuit breaker: while PostgreSQL cannot accept even SELECT 1,
  // do not let public/account/catalogue requests continuously open new database
  // connections. This is intentionally temporary and must be disabled after
  // connectivity is restored.
  const html = `<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,follow" />
<meta http-equiv="refresh" content="90" />
<title>ΚΟΝΤΑ ΜΟΥ · Προσωρινή αποκατάσταση</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: radial-gradient(circle at 50% 20%, #2d251f 0, #15120f 42%, #0b0a09 100%);
    color: #f7f2eb; font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  }
  main {
    width: min(92vw, 620px); padding: 36px 28px; border: 1px solid rgba(255,255,255,.12);
    border-radius: 28px; background: rgba(255,255,255,.045); backdrop-filter: blur(12px);
    box-shadow: 0 24px 70px rgba(0,0,0,.35); text-align: center;
  }
  .brand { font-size: clamp(28px,7vw,46px); font-weight: 900; letter-spacing: .06em; }
  .dot { width: 12px; height: 12px; border-radius: 50%; margin: 22px auto; background: #d9b48f; box-shadow: 0 0 0 9px rgba(217,180,143,.12); }
  h1 { margin: 0 0 14px; font-size: clamp(24px,5vw,36px); line-height: 1.15; }
  p { margin: 0 auto; max-width: 48ch; color: #d7cec5; line-height: 1.6; font-size: 16px; }
  .small { margin-top: 18px; font-size: 13px; color: #9f958b; }
  button {
    margin-top: 26px; border: 0; border-radius: 999px; padding: 13px 22px;
    font: inherit; font-weight: 800; cursor: pointer; background: #f7f2eb; color: #15120f;
  }
</style>
</head>
<body>
<main>
  <div class="brand">ΚΟΝΤΑ ΜΟΥ</div>
  <div class="dot" aria-hidden="true"></div>
  <h1>Επιστρέφουμε σε λίγο.</h1>
  <p>Γίνεται προσωρινή τεχνική αποκατάσταση της πρόσβασης στον κατάλογο. Οι αγορές και τα δεδομένα παραμένουν προστατευμένα.</p>
  <button onclick="location.reload()">Δοκίμασε ξανά</button>
  <div class="small">Η σελίδα θα δοκιμάσει ξανά αυτόματα σε 90″.</div>
</main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "120",
      "x-robots-tag": "noindex, follow"
    }
  });
}

function productPrefetchResponse(request: NextRequest): NextResponse | undefined {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/product/")) return undefined;
  const purpose = [
    request.headers.get("purpose"),
    request.headers.get("sec-purpose")
  ].filter(Boolean).join(" ").toLowerCase();
  const nextPrefetch = request.headers.get("next-router-prefetch");
  if (nextPrefetch !== "1" && !purpose.includes("prefetch")) return undefined;
  return new NextResponse(null, {
    status: 204,
    headers: {
      "cache-control": "private, no-store",
      "x-km-prefetch-shed": "1"
    }
  });
}

export async function proxy(request: NextRequest) {
  const prefetch = productPrefetchResponse(request);
  if (prefetch) return prefetch;

  const recovery = databaseRecoveryResponse(request);
  if (recovery) return recovery;
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
  return applySeoDocumentHeaders(request, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"]
};
