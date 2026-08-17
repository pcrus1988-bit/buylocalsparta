import { describe, expect, it } from "vitest";
import { productionDatabaseConfigured, resolveDatabaseUrlFromEnv } from "./postgres-runtime";

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
});
