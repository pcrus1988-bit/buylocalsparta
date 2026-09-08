const PRODUCTION_PUBLIC_ORIGIN = "https://kontamou.site";

export function publicOrigin(): string {
  // The public production deployment has one authoritative host. Vercel preview
  // deployments still retain their own origin so preview auth/callback flows keep
  // working, but production must never inherit a legacy .info or *.vercel.app host
  // into canonicals, sitemap URLs, structured data or public links.
  if (process.env.VERCEL_ENV === "production") return PRODUCTION_PUBLIC_ORIGIN;

  const configured = process.env.APP_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (!configured) return process.env.NODE_ENV === "production" ? PRODUCTION_PUBLIC_ORIGIN : "http://localhost:3000";
  const candidate = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  const url = new URL(candidate);
  if (!/^https?:$/.test(url.protocol)) throw new Error("APP_URL must use HTTP or HTTPS");

  if (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV) {
    const retiredHost = url.hostname === "kontamou.info"
      || url.hostname === "www.kontamou.info"
      || url.hostname === "buylocalsparta.gr"
      || url.hostname === "www.buylocalsparta.gr"
      || url.hostname.endsWith(".vercel.app");
    if (retiredHost) return PRODUCTION_PUBLIC_ORIGIN;
  }

  return url.origin;
}
