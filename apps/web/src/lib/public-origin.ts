export function publicOrigin(): string {
  const configured = process.env.APP_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (!configured) return process.env.NODE_ENV === "production" ? "https://buylocalsparta.gr" : "http://localhost:3000";
  const candidate = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  const url = new URL(candidate);
  if (!/^https?:$/.test(url.protocol)) throw new Error("APP_URL must use HTTP or HTTPS");
  return url.origin;
}
