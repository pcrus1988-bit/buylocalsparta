import { EXPECTED_SCHEMA_VERSION, createPostgresRuntimeFromEnv, type ProductionPostgresRuntime } from "@buy-local-sparta/postgres-runtime";

const globalKey = "__buyLocalSpartaPostgresRuntime" as const;
const globals = globalThis as typeof globalThis & { [globalKey]?: ProductionPostgresRuntime };

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

function postgresRuntimeEnv(): NodeJS.ProcessEnv {
  const connectionString = resolveDatabaseUrlFromEnv();
  return connectionString ? { ...process.env, DATABASE_URL: connectionString } : process.env;
}

export function databaseRuntimeRequired(): boolean {
  return process.env.NODE_ENV === "production" && process.env.BLS_ALLOW_DATABASELESS_PREVIEW !== "true";
}

export function getProductionPostgresRuntime(): ProductionPostgresRuntime {
  if (!productionDatabaseConfigured()) throw new Error("DATABASE_URL or POSTGRES_URL is required for production shared state");
  return globals[globalKey] ?? (globals[globalKey] = createPostgresRuntimeFromEnv({ env: postgresRuntimeEnv(), applicationName: "buy-local-sparta-web" }));
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
