import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRateLimiter, OperationalHealthService, RateLimitError } from "../src/index.ts";

test("fixed-window rate limiter enforces limit and resets after window", () => {
  const limiter = new InMemoryRateLimiter();
  const rule = { limit: 2, windowMs: 1_000 };
  assert.equal(limiter.assertAllowed({ key: "login:ip-1", rule, now: 100 }).remaining, 1);
  assert.equal(limiter.assertAllowed({ key: "login:ip-1", rule, now: 200 }).remaining, 0);
  assert.throws(() => limiter.assertAllowed({ key: "login:ip-1", rule, now: 300 }), (error: unknown) => {
    assert.ok(error instanceof RateLimitError);
    assert.equal(error.decision.allowed, false);
    assert.equal(error.decision.retryAfterMs, 800);
    return true;
  });
  assert.equal(limiter.assertAllowed({ key: "login:ip-1", rule, now: 1_100 }).remaining, 1);
});

test("rate limits isolate unrelated keys", () => {
  const limiter = new InMemoryRateLimiter();
  const rule = { limit: 1, windowMs: 60_000 };
  limiter.assertAllowed({ key: "login:a", rule, now: 0 });
  assert.equal(limiter.assertAllowed({ key: "login:b", rule, now: 1 }).allowed, true);
  assert.throws(() => limiter.assertAllowed({ key: "login:a", rule, now: 2 }), RateLimitError);
});

test("readiness fails only on critical unhealthy dependencies", async () => {
  const health = new OperationalHealthService();
  health.register({ name: "catalog", check: () => undefined });
  health.register({ name: "email", critical: false, check: () => ({ state: "unhealthy", message: "provider unavailable" }) });
  let report = await health.readiness(10);
  assert.equal(report.ok, true);
  assert.equal(report.state, "degraded");

  health.register({ name: "payments", critical: true, check: () => { throw new Error("payment adapter unavailable"); } });
  report = await health.readiness(20);
  assert.equal(report.ok, false);
  assert.equal(report.state, "unhealthy");
  assert.equal(report.checks.find((item) => item.name === "payments")?.message, "payment adapter unavailable");
});

test("health checks time out instead of hanging readiness", async () => {
  const health = new OperationalHealthService();
  health.register({ name: "slow", timeoutMs: 5, check: () => new Promise(() => undefined) });
  const report = await health.readiness();
  assert.equal(report.ok, false);
  assert.match(report.checks[0].message ?? "", /timed out/i);
});

test("security events exclude secret-like metadata and summarize by type/severity", async () => {
  const { SecurityEventService } = await import("../src/index.ts");
  const events = new SecurityEventService();
  const created = events.record({
    type: "rate_limit.exceeded",
    severity: "medium",
    requestId: "req-1",
    route: "/api/auth/login",
    method: "POST",
    subjectHash: "abc123",
    details: { limit: 10, password: "must-not-store", token: "must-not-store", reason: "ip bucket user@example.com +306912345678" },
    occurredAt: 1_000
  });
  assert.equal(created.details?.limit, 10);
  assert.equal("password" in (created.details ?? {}), false);
  assert.equal("token" in (created.details ?? {}), false);
  assert.equal(String(created.details?.reason).includes("user@example.com"), false);
  assert.equal(String(created.details?.reason).includes("6912345678"), false);
  const summary = events.summary(0);
  assert.equal(summary.total, 1);
  assert.equal(summary.byType["rate_limit.exceeded"], 1);
  assert.equal(summary.bySeverity.medium, 1);
  assert.equal(events.purge(2_000), 1);
});

test("personal-data access events keep purpose metadata but never raw contact data", async () => {
  const { SecurityEventService } = await import("../src/index.ts");
  const events = new SecurityEventService();
  const created = events.record({
    type: "personal_data.accessed",
    severity: "low",
    route: "/admin/customers/[customerId]",
    method: "GET",
    subjectHash: "4f8c8b88f2d8c9204c327427e1584360",
    actorUserId: "usr_admin",
    details: {
      purpose: "customer_management",
      resourceType: "customer",
      dataClasses: "identity,contact,addresses",
      recordCount: 1,
      email: "person@example.test",
      note: "caller person@example.test +306912345678"
    },
    occurredAt: 5_000
  });
  assert.equal(created.type, "personal_data.accessed");
  assert.equal(created.details?.purpose, "customer_management");
  assert.equal(created.details?.dataClasses, "identity,contact,addresses");
  assert.equal("email" in (created.details ?? {}), false);
  assert.equal(String(created.details?.note).includes("person@example.test"), false);
  assert.equal(String(created.details?.note).includes("6912345678"), false);
});
