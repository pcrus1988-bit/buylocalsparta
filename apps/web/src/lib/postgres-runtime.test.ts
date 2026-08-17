import { describe, expect, it } from "vitest";
import { resolveDatabaseUrlFromEnv } from "./postgres-runtime";

describe("production database URL resolution", () => {
  it("prefers DATABASE_URL when both variables are configured", () => {
    expect(resolveDatabaseUrlFromEnv({ DATABASE_URL: " postgres://explicit ", POSTGRES_URL: "postgres://marketplace" })).toBe("postgres://explicit");
  });

  it("uses Vercel Marketplace POSTGRES_URL when DATABASE_URL is absent", () => {
    expect(resolveDatabaseUrlFromEnv({ POSTGRES_URL: " postgres://marketplace " })).toBe("postgres://marketplace");
  });

  it("uses POSTGRES_URL when DATABASE_URL is blank", () => {
    expect(resolveDatabaseUrlFromEnv({ DATABASE_URL: "  ", POSTGRES_URL: "postgres://marketplace" })).toBe("postgres://marketplace");
  });

  it("keeps TLS enabled but uses node-postgres compatibility mode for Supabase Marketplace URLs", () => {
    const resolved = resolveDatabaseUrlFromEnv({
      POSTGRES_URL: "postgresql://postgres:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
    });
    expect(resolved).toContain("aws-0-us-east-1.pooler.supabase.com");
    expect(resolved).toContain("sslmode=no-verify");
  });

  it("does not weaken an explicit DATABASE_URL configuration", () => {
    const explicit = "postgresql://app:secret@example.com:5432/app?sslmode=verify-full";
    expect(resolveDatabaseUrlFromEnv({ DATABASE_URL: explicit })).toBe(explicit);
  });

  it("stays database-less when neither variable is configured", () => {
    expect(resolveDatabaseUrlFromEnv({})).toBeUndefined();
  });
});
