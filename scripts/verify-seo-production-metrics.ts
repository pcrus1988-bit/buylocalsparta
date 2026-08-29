import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

async function source(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

function requireText(text: string, fragment: string, label: string): void {
  if (!text.includes(fragment)) throw new Error(`${label} is missing required contract: ${fragment}`);
}

const [migration, googleClient, syncRuntime, cronRoute, vercel, checksum] = await Promise.all([
  source("db/migrations/0156_seo_production_metrics.sql"),
  source("apps/web/src/lib/seo-google-metrics.ts"),
  source("apps/web/src/lib/seo-production-metrics.ts"),
  source("apps/web/src/app/api/cron/seo-production-metrics/route.ts"),
  source("vercel.json"),
  source("db/migrations/checksums.0156.json")
]);

for (const table of [
  "seo_production_metrics_sync_state",
  "seo_gsc_daily_page_metrics",
  "seo_ga4_daily_landing_metrics"
]) {
  requireText(migration, `CREATE TABLE ${table}`, "SEO metrics migration");
  requireText(migration, `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, "SEO metrics migration");
}
requireText(migration, "CHECK (provider IN ('gsc','ga4'))", "SEO metrics migration");
requireText(migration, "bls_private.is_platform_runtime()", "SEO metrics migration");
requireText(checksum, "0156_seo_production_metrics.sql", "SEO migration checksum fragment");

requireText(googleClient, "https://www.googleapis.com/auth/webmasters.readonly", "Google metrics client");
requireText(googleClient, "https://www.googleapis.com/auth/analytics.readonly", "Google metrics client");
requireText(googleClient, 'dimensions: ["date", "page"]', "Search Console daily report");
requireText(googleClient, '{ name: "landingPage" }', "GA4 organic landing report");
requireText(googleClient, 'fieldName: "sessionDefaultChannelGroup"', "GA4 organic landing report");
requireText(googleClient, 'value: "Organic Search"', "GA4 organic landing report");
requireText(googleClient, "BLS_GOOGLE_ANALYTICS_PROPERTY_ID", "GA4 readiness");
requireText(googleClient, "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL", "shared service-account fallback");

requireText(syncRuntime, "const RETENTION_MONTHS = 16", "SEO production sync runtime");
requireText(syncRuntime, "const BACKFILL_CHUNK_DAYS = 28", "SEO production sync runtime");
requireText(syncRuntime, "ON CONFLICT(market_id,day,route) DO UPDATE SET", "idempotent daily metric persistence");
requireText(syncRuntime, "pruneOldMetrics", "rolling retention");
requireText(syncRuntime, "Promise.all([", "independent provider sync");

requireText(cronRoute, "CRON_SECRET", "SEO metrics cron authorization");
requireText(cronRoute, "syncSeoProductionMetrics", "SEO metrics cron execution");
requireText(cronRoute, 'status: hasProviderError ? 502 : 200', "SEO metrics cron health signaling");

const vercelConfig = JSON.parse(vercel) as { crons?: readonly { path?: string; schedule?: string }[] };
const cron = vercelConfig.crons?.find((item) => item.path === "/api/cron/seo-production-metrics");
if (!cron) throw new Error("Vercel configuration does not schedule the SEO production metrics cron.");
if (!/^\d+ \d+ \* \* \*$/.test(cron.schedule ?? "")) throw new Error("SEO production metrics cron must run daily at a deterministic time.");

console.log("SEO production metrics automation contracts OK.");
