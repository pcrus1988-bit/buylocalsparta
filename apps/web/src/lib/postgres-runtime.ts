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

// Vercel Marketplace integrations commonly inject POSTGRES_URL rather than DATABASE_URL.
// Normalize that once at module load so legacy runtime gates cannot silently fall back to
// in-memory/demo adapters while the production database is actually available.
const bootstrapDatabaseUrl = resolveDatabaseUrlFromEnv();
if (!process.env.DATABASE_URL?.trim() && bootstrapDatabaseUrl) process.env.DATABASE_URL = bootstrapDatabaseUrl;

function postgresRuntimeEnv(): NodeJS.ProcessEnv {
  const connectionString = resolveDatabaseUrlFromEnv();
  return connectionString ? { ...process.env, DATABASE_URL: connectionString } : process.env;
}

export function databaseRuntimeRequired(): boolean {
  return process.env.NODE_ENV === "production" && process.env.BLS_ALLOW_DATABASELESS_PREVIEW !== "true";
}

export function getProductionPostgresRuntime(): ProductionPostgresRuntime {
  if (!resolveDatabaseUrlFromEnv()) throw new Error("DATABASE_URL or POSTGRES_URL is required for production shared state");
  return globals[globalKey] ?? (globals[globalKey] = createPostgresRuntimeFromEnv({ env: postgresRuntimeEnv(), applicationName: "buy-local-sparta-web" }));
}

export async function productionDatabaseReadiness() {
  if (!resolveDatabaseUrlFromEnv()) {
    return {
      ok: !databaseRuntimeRequired(),
      checkedAt: Date.now(),
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      message: databaseRuntimeRequired() ? "DATABASE_URL or POSTGRES_URL is required in production" : "Database is not configured; development adapters remain active"
    } as const;
  }
  return getProductionPostgresRuntime().readiness();
}
