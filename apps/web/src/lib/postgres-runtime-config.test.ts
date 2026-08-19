import { describe, expect, it } from "vitest";
import { buildWebPostgresRuntimeEnv, productionDatabaseConfigured, resolveDatabaseUrlFromEnv } from "./postgres-runtime";

describe("production database configuration", () => {
  it("detects an explicit DATABASE_URL", () => {
    expect(productionDatabaseConfigured({ DATABASE_URL: "postgres://explicit" })).toBe(true);
  });

  it("detects a Vercel Marketplace POSTGRES_URL", () => {
    expect(productionDatabaseConfigured({ POSTGRES_URL: "postgres://user:pass@db.example.supabase.co:5432/postgres" })).toBe(true);
  });

  it("keeps explicit DATABASE_URL precedence", () => {
    expect(resolveDatabaseUrlFromEnv({ DATABASE_URL: "postgres://explicit", POSTGRES_URL: "postgres://marketplace" })).toBe("postgres://explicit");
  });

  it("does not claim a database when neither value exists", () => {
    expect(productionDatabaseConfigured({})).toBe(false);
  });

  it("uses conservative web pool defaults without mutating the source environment", () => {
    const source: NodeJS.ProcessEnv = {
      POSTGRES_URL: "postgres://user:pass@db.example.supabase.co:5432/postgres"
    };
    const runtimeEnv = buildWebPostgresRuntimeEnv(source);

    expect(runtimeEnv.DATABASE_URL).toContain("db.example.supabase.co");
    expect(runtimeEnv.BLS_DB_POOL_MAX).toBe("2");
    expect(runtimeEnv.BLS_DB_IDLE_TIMEOUT_MS).toBe("10000");
    expect(source.BLS_DB_POOL_MAX).toBeUndefined();
    expect(source.BLS_DB_IDLE_TIMEOUT_MS).toBeUndefined();
  });

  it("preserves explicit database pool tuning", () => {
    const runtimeEnv = buildWebPostgresRuntimeEnv({
      DATABASE_URL: "postgres://explicit",
      BLS_DB_POOL_MAX: "6",
      BLS_DB_IDLE_TIMEOUT_MS: "45000"
    });

    expect(runtimeEnv.BLS_DB_POOL_MAX).toBe("6");
    expect(runtimeEnv.BLS_DB_IDLE_TIMEOUT_MS).toBe("45000");
  });
});
