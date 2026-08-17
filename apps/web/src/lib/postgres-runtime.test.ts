import { describe, expect, it } from "vitest";

// Runtime URL precedence is intentionally tested here without opening a database connection.
function resolveDatabaseUrl(env: NodeJS.ProcessEnv): string | undefined {
  return env.DATABASE_URL?.trim() || env.POSTGRES_URL?.trim() || undefined;
}

describe("production database URL resolution", () => {
  it("prefers DATABASE_URL when both variables are configured", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: " postgres://explicit ", POSTGRES_URL: "postgres://marketplace" })).toBe("postgres://explicit");
  });

  it("uses Vercel Marketplace POSTGRES_URL when DATABASE_URL is absent", () => {
    expect(resolveDatabaseUrl({ POSTGRES_URL: " postgres://marketplace " })).toBe("postgres://marketplace");
  });

  it("uses POSTGRES_URL when DATABASE_URL is blank", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "  ", POSTGRES_URL: "postgres://marketplace" })).toBe("postgres://marketplace");
  });

  it("stays database-less when neither variable is configured", () => {
    expect(resolveDatabaseUrl({})).toBeUndefined();
  });
});
