import { EXPECTED_SCHEMA_VERSION, createPostgresRuntimeFromEnv, type ProductionPostgresRuntime } from "@buy-local-sparta/postgres-runtime";

const globalKey = "__buyLocalSpartaPostgresRuntime" as const;
const globals = globalThis as typeof globalThis & { [globalKey]?: ProductionPostgresRuntime };

export function databaseRuntimeRequired(): boolean {
  return process.env.NODE_ENV === "production" && process.env.BLS_ALLOW_DATABASELESS_PREVIEW !== "true";
}

export function getProductionPostgresRuntime(): ProductionPostgresRuntime {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required for production shared state");
  return globals[globalKey] ?? (globals[globalKey] = createPostgresRuntimeFromEnv({ applicationName: "buy-local-sparta-web" }));
}

export async function productionDatabaseReadiness() {
  if (!process.env.DATABASE_URL?.trim()) {
    return {
      ok: !databaseRuntimeRequired(),
      checkedAt: Date.now(),
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      message: databaseRuntimeRequired() ? "DATABASE_URL is required in production" : "Database is not configured; development adapters remain active"
    } as const;
  }
  return getProductionPostgresRuntime().readiness();
}
