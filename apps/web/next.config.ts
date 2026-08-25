import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_DIR = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = join(WEB_DIR, "../..");

const MEDIA_UPLOAD_ORIGIN = normalizedOrigin(process.env.BLS_MEDIA_UPLOAD_ORIGIN);
const BOXNOW_WIDGET_ENABLED = process.env.NEXT_PUBLIC_BOXNOW_WIDGET_ENABLED === "true";
const GOOGLE_MAPS_BROWSER_ENABLED = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim());

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `style-src 'self' 'unsafe-inline' https://unpkg.com${GOOGLE_MAPS_BROWSER_ENABLED ? " https://fonts.googleapis.com" : ""}`,
  `script-src 'self' 'unsafe-inline' https://unpkg.com${BOXNOW_WIDGET_ENABLED ? " https://widget-cdn.boxnow.gr" : ""}${GOOGLE_MAPS_BROWSER_ENABLED ? " https://maps.googleapis.com https://maps.gstatic.com" : ""}`,
  // Catalogue fallback images are admitted only after public-product-detail verifies
  // HTTPS and exact source-host equality. The CSP therefore permits HTTPS images
  // generically instead of requiring a code deploy for every governed supplier host.
  "img-src 'self' data: blob: https:",
  `connect-src 'self'${MEDIA_UPLOAD_ORIGIN ? ` ${MEDIA_UPLOAD_ORIGIN}` : ""}${BOXNOW_WIDGET_ENABLED ? " https://widget-cdn.boxnow.gr https://map.boxnow.gr" : ""}${GOOGLE_MAPS_BROWSER_ENABLED ? " https://maps.googleapis.com https://maps.gstatic.com" : ""}`,
  `font-src 'self' data:${GOOGLE_MAPS_BROWSER_ENABLED ? " https://fonts.gstatic.com" : ""}`,
  `frame-src 'self'${BOXNOW_WIDGET_ENABLED ? " https://map.boxnow.gr https://widget-v4.boxnow.gr https://widget-v5.boxnow.gr" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Ask Local voice input is a first-party feature. Keep microphone access limited
  // to this origin; the browser still requires the customer's explicit permission.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-DNS-Prefetch-Control", value: "off" }
] as const;

const SEARCH_EXCLUDED_HEADERS = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
  { key: "Cache-Control", value: "private, no-store, max-age=0" }
] as const;

// Central search-engine exclusion is deliberately separate from authentication.
// Route handlers/pages still enforce identity, ownership and RBAC. These headers
// ensure a newly discovered private URL cannot become a useful search result even
// if a page-specific Metadata export is accidentally omitted in the future.
const SEARCH_EXCLUDED_SOURCES = [
  "/account/:path*",
  "/admin/:path*",
  "/daily/:path*",
  "/driver/:path*",
  "/cart",
  "/checkout/:path*",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/join/apply",
  "/vendor/login/:path*",
  "/vendor/advice/:path*",
  "/vendor/analytics/:path*",
  "/vendor/catalog/:path*",
  "/vendor/daily-access/:path*",
  "/vendor/finance/:path*",
  "/vendor/notifications/:path*",
  "/vendor/orders/:path*",
  "/vendor/pickup/:path*",
  "/vendor/reports/:path*",
  "/vendor/returns/:path*",
  "/vendor/shipping/:path*",
  "/vendor/storefront/:path*",
  "/vendor/trust/:path*",
  "/api/account/:path*",
  "/api/admin/:path*",
  "/api/daily/:path*",
  "/api/driver/:path*",
  "/api/internal/:path*",
  "/api/vendor/:path*"
] as const;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: MONOREPO_ROOT,
  transpilePackages: ["@buy-local-sparta/core", "@buy-local-sparta/postgres-runtime", "@buy-local-sparta/viva-payments", "@buy-local-sparta/aade-mydata", "@buy-local-sparta/object-storage", "@buy-local-sparta/media-processing", "@buy-local-sparta/meilisearch-search", "@buy-local-sparta/resend-notifications", "@buy-local-sparta/boxnow-shipping"],
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [...SECURITY_HEADERS]
      },
      ...SEARCH_EXCLUDED_SOURCES.map((source) => ({ source, headers: [...SEARCH_EXCLUDED_HEADERS] }))
    ];
  }
};

function normalizedOrigin(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const parsed = new URL(raw.trim());
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("BLS_MEDIA_UPLOAD_ORIGIN must be an origin without path/query/hash");
  if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") throw new Error("BLS_MEDIA_UPLOAD_ORIGIN must use HTTPS in production");
  return parsed.origin;
}

export default nextConfig;