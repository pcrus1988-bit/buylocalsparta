import { EXPECTED_SCHEMA_VERSION, createPostgresRuntimeFromEnv, type ProductionPostgresRuntime } from "@buy-local-sparta/postgres-runtime";

const globalKey = "__buyLocalSpartaPostgresRuntime" as const;
const globals = globalThis as typeof globalThis & { [globalKey]?: ProductionPostgresRuntime };

function resolvedDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || undefined;
}

function postgresRuntimeEnv(): NodeJS.ProcessEnv {
  const connectionString = resolvedDatabaseUrl();
  return connectionString ? { ...process.env, DATABASE_URL: connectionString } : process.env;
}

export function databaseRuntimeRequired(): boolean {
  return process.env.NODE_ENV === "production" && process.env.BLS_ALLOW_DATABASELESS_PREVIEW !== "true";
}

export function getProductionPostgresRuntime(): ProductionPostgresRuntime {
  if (!resolvedDatabaseUrl()) throw new Error("DATABASE_URL or POSTGRES_URL is required for production shared state");
  return globals[globalKey] ?? (globals[globalKey] = createPostgresRuntimeFromEnv({ env: postgresRuntimeEnv(), applicationName: "buy-local-sparta-web" }));
}

export async function productionDatabaseReadiness() {
  if (!resolvedDatabaseUrl()) {
    return {
      ok: !databaseRuntimeRequired(),
      checkedAt: Date.now(),
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      message: databaseRuntimeRequired() ? "DATABASE_URL or POSTGRES_URL is required in production" : "Database is not configured; development adapters remain active"
    } as const;
  }
  return getProductionPostgresRuntime().readiness();
}
