import { createHmac } from "node:crypto";
import { EXPECTED_SCHEMA_VERSION, createPostgresRuntimeFromEnv, type ProductionPostgresRuntime } from "@buy-local-sparta/postgres-runtime";

const globalKey = "__buyLocalSpartaPostgresRuntime" as const;
const globals = globalThis as typeof globalThis & { [globalKey]?: ProductionPostgresRuntime };
const WEB_DB_POOL_MAX = "2";
const WEB_DB_IDLE_TIMEOUT_MS = "10000";

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
  } catch {
    return marketplace;
  }
}

export function productionDatabaseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(resolveDatabaseUrlFromEnv(env));
}

// Some older web adapters still gate on DATABASE_URL directly. Vercel's Marketplace
// integration may provide only POSTGRES_URL, so normalize the resolved production URL
// once before those modules evaluate their runtime gates. This prevents accidental
// in-memory/demo execution while the real database is connected.
const bootstrapDatabaseUrl = resolveDatabaseUrlFromEnv();
if (!process.env.DATABASE_URL?.trim() && bootstrapDatabaseUrl) process.env.DATABASE_URL = bootstrapDatabaseUrl;

// Marketplace Resend provides RESEND_API_KEY. Unless the operator explicitly disables
// email, expose that as the existing application feature flag so registration and other
// legacy gates turn on without duplicating the key configuration in Vercel.
if (process.env.RESEND_API_KEY?.trim() && !process.env.BLS_EMAIL_DELIVERY_ENABLED?.trim()) {
  process.env.BLS_EMAIL_DELIVERY_ENABLED = "true";
}

/**
 * Vercel can create multiple warm Node.js instances under concurrent traffic. The shared
 * PostgreSQL runtime is a singleton only inside one instance, so using the package default
 * of ten connections per instance can multiply into a much larger database connection
 * footprint. Keep the web runtime deliberately small and release idle clients quickly;
 * operators can still override either setting explicitly for a dedicated/pooler-backed DB.
 */
export function buildWebPostgresRuntimeEnv(sourceEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const connectionString = resolveDatabaseUrlFromEnv(sourceEnv);
  const env: NodeJS.ProcessEnv = connectionString ? { ...sourceEnv, DATABASE_URL: connectionString } : { ...sourceEnv };

  if (connectionString) {
    if (!env.BLS_DB_POOL_MAX?.trim()) env.BLS_DB_POOL_MAX = WEB_DB_POOL_MAX;
    if (!env.BLS_DB_IDLE_TIMEOUT_MS?.trim()) env.BLS_DB_IDLE_TIMEOUT_MS = WEB_DB_IDLE_TIMEOUT_MS;
  }
  if (env.RESEND_API_KEY?.trim() && !env.BLS_EMAIL_DELIVERY_ENABLED?.trim()) env.BLS_EMAIL_DELIVERY_ENABLED = "true";
  if (env.BLS_EMAIL_DELIVERY_ENABLED === "true" && !env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim()) {
    const authSecret = env.BLS_AUTH_SECRET?.trim();
    if (authSecret && authSecret.length >= 32) {
      env.BLS_NOTIFICATION_SUPPRESSION_SECRET = createHmac("sha256", authSecret)
        .update("buy-local-sparta:notification-suppression:v1")
        .digest("hex");
    }
  }
  return env;
}

export function databaseRuntimeRequired(): boolean {
  return process.env.NODE_ENV === "production" && process.env.BLS_ALLOW_DATABASELESS_PREVIEW !== "true";
}

export function getProductionPostgresRuntime(): ProductionPostgresRuntime {
  if (!productionDatabaseConfigured()) throw new Error("DATABASE_URL or POSTGRES_URL is required for production shared state");
  return globals[globalKey] ?? (globals[globalKey] = createPostgresRuntimeFromEnv({ env: buildWebPostgresRuntimeEnv(), applicationName: "buy-local-sparta-web" }));
}

export async function productionDatabaseReadiness() {
  if (!productionDatabaseConfigured()) {
    return {
      ok: !databaseRuntimeRequired(),
      checkedAt: Date.now(),
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      message: databaseRuntimeRequired() ? "DATABASE_URL or POSTGRES_URL is required in production" : "Database is not configured; development adapters remain active"
    } as const;
  }
  return getProductionPostgresRuntime().readiness();
}
