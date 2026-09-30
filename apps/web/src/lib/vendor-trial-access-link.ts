export function buildVendorTrialAccessUrl(token: string, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.BLS_PUBLIC_BASE_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim();
  const deployment = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  const base = explicit
    ? explicit
    : deployment
      ? `https://${deployment.replace(/^https?:\/\//, "")}`
      : "https://kontamou.site";
  return `${base.replace(/\/$/, "")}/api/vendor/trial/access?token=${encodeURIComponent(token)}`;
}
