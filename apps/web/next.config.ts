import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_DIR = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = join(WEB_DIR, "../..");

const MEDIA_UPLOAD_ORIGIN = normalizedOrigin(process.env.BLS_MEDIA_UPLOAD_ORIGIN);
const BOXNOW_WIDGET_ENABLED = process.env.NEXT_PUBLIC_BOXNOW_WIDGET_ENABLED === "true";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  `script-src 'self' 'unsafe-inline' https://unpkg.com${BOXNOW_WIDGET_ENABLED ? " https://widget-cdn.boxnow.gr" : ""}`,
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  `connect-src 'self'${MEDIA_UPLOAD_ORIGIN ? ` ${MEDIA_UPLOAD_ORIGIN}` : ""}${BOXNOW_WIDGET_ENABLED ? " https://widget-cdn.boxnow.gr https://map.boxnow.gr" : ""}`,
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
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-DNS-Prefetch-Control", value: "off" }
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
      }
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
