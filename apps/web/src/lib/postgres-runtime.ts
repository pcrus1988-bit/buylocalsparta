import { createHmac } from "node:crypto";
import { EXPECTED_SCHEMA_VERSION, createPostgresRuntimeFromEnv, type ProductionPostgresRuntime } from "@buy-local-sparta/postgres-runtime";

const WEB_EXPECTED_SCHEMA_VERSION = EXPECTED_SCHEMA_VERSION;
const globalKey = "__buyLocalSpartaPostgresRuntime" as const;
const globals = globalThis as typeof globalThis & { [globalKey]?: ProductionPostgresRuntime };
const WEB_DB_POOL_MAX = "1";
const WEB_DB_CONNECT_TIMEOUT_MS = "15000";
const WEB_DB_IDLE_TIMEOUT_MS = "5000";

export function resolveDatabaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.DATABASE_URL?.trim();
  if (explicit) return explicit;
  const marketplace = env.POSTGRES_URL?.trim();
  if (!marketplace) return undefined;
  try {
    const url = new URL(marketplace);
    const hostname = url.hostname.toLowerCase();
    const isSupabase = hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.com");
    if (isSupabase) url.searchParams.set("sslmode", "no-verify");
    return url.toString();
  } catch { return marketplace; }
}

export function productionDatabaseConfigured(env: NodeJS.ProcessEnv = process.env): boolean { return Boolean(resolveDatabaseUrlFromEnv(env)); }

const bootstrapDatabaseUrl = resolveDatabaseUrlFromEnv();
if (!process.env.DATABASE_URL?.trim() && bootstrapDatabaseUrl) process.env.DATABASE_URL = bootstrapDatabaseUrl;
if (process.env.RESEND_API_KEY?.trim() && !process.env.BLS_EMAIL_DELIVERY_ENABLED?.trim()) process.env.BLS_EMAIL_DELIVERY_ENABLED = "true";

// Preview deployments intentionally do not receive the live Mollie secret. Vercel still
// inherits the project-level enable flag, so without this guard any read-only server render
// would eagerly construct the payment adapter and fail the entire preview build. Disable the
// adapter only for that exact preview/missing-secret combination. Production remains fail-closed:
// when MOLLIE_PAYMENTS_ENABLED=true there, the PostgreSQL runtime still requires a valid live key.
if (process.env.VERCEL_ENV === "preview"
  && process.env.MOLLIE_PAYMENTS_ENABLED === "true"
  && !process.env.MOLLIE_API_KEY?.trim()) {
  process.env.MOLLIE_PAYMENTS_ENABLED = "false";
}

/**
 * Vercel can create multiple warm Node.js instances under concurrent traffic. The shared
 * PostgreSQL runtime is a singleton only inside one instance, so using the package default
 * of ten connections per instance can multiply into a much larger database connection
 * footprint. Supabase transaction-mode pooling is already in front of the database, so
 * a serverless web instance should contribute only one persistent pg client by default.
 * Release idle clients quickly; operators can still override either setting explicitly
 * for a dedicated/pooler-backed deployment after measuring connection demand.
 * Production builds remain schema-gated through EXPECTED_SCHEMA_VERSION and the migration
 * ledger fingerprint before serving traffic.
 */
export function buildWebPostgresRuntimeEnv(sourceEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const connectionString = resolveDatabaseUrlFromEnv(sourceEnv);
  const env: NodeJS.ProcessEnv = connectionString ? { ...sourceEnv, DATABASE_URL: connectionString } : { ...sourceEnv };
  if (connectionString) {
    if (!env.BLS_DB_POOL_MAX?.trim()) env.BLS_DB_POOL_MAX = WEB_DB_POOL_MAX;
    if (!env.BLS_DB_CONNECT_TIMEOUT_MS?.trim()) env.BLS_DB_CONNECT_TIMEOUT_MS = WEB_DB_CONNECT_TIMEOUT_MS;
    if (!env.BLS_DB_IDLE_TIMEOUT_MS?.trim()) env.BLS_DB_IDLE_TIMEOUT_MS = WEB_DB_IDLE_TIMEOUT_MS;
  }
  if (env.RESEND_API_KEY?.trim() && !env.BLS_EMAIL_DELIVERY_ENABLED?.trim()) env.BLS_EMAIL_DELIVERY_ENABLED = "true";
  if (env.BLS_EMAIL_DELIVERY_ENABLED === "true" && !env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim()) {
    const authSecret = env.BLS_AUTH_SECRET?.trim();
    if (authSecret && authSecret.length >= 32) env.BLS_NOTIFICATION_SUPPRESSION_SECRET = createHmac("sha256", authSecret).update("buy-local-sparta:notification-suppression:v1").digest("hex");
  }
  return env;
}

export function databaseRuntimeRequired(): boolean { return process.env.NODE_ENV === "production" && process.env.BLS_ALLOW_DATABASELESS_PREVIEW !== "true"; }
export function getProductionPostgresRuntime(): ProductionPostgresRuntime {
  if (!productionDatabaseConfigured()) throw new Error("DATABASE_URL or POSTGRES_URL is required for production shared state");
  return globals[globalKey] ?? (globals[globalKey] = createPostgresRuntimeFromEnv({ env: buildWebPostgresRuntimeEnv(), applicationName: "buy-local-sparta-web" }));
}

export async function productionDatabaseReadiness() {
  if (!productionDatabaseConfigured()) return { ok: !databaseRuntimeRequired(), checkedAt: Date.now(), expectedSchemaVersion: WEB_EXPECTED_SCHEMA_VERSION, message: databaseRuntimeRequired() ? "DATABASE_URL or POSTGRES_URL is required in production" : "Database is not configured; development adapters remain active" } as const;
  return getProductionPostgresRuntime().readiness(WEB_EXPECTED_SCHEMA_VERSION);
}
