import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOMER_TRY_ON_MONTHLY_LIMIT,
  customerTryOnQuotaSnapshot,
  customerTryOnQuotaWindow
} from "./try-on-quota.ts";

test("Try On monthly quota is exactly 50 generations", () => {
  assert.equal(CUSTOMER_TRY_ON_MONTHLY_LIMIT, 50);
  const quota = customerTryOnQuotaSnapshot(49, Date.UTC(2026, 9, 5, 10, 0, 0));
  assert.equal(quota.used, 49);
  assert.equal(quota.remaining, 1);
});

test("Try On quota resets on the first day of the next UTC calendar month", () => {
  const october = customerTryOnQuotaWindow(Date.UTC(2026, 9, 31, 23, 59, 59));
  assert.equal(october.monthStart, "2026-10-01");
  assert.equal(october.resetAt, "2026-11-01T00:00:00.000Z");

  const december = customerTryOnQuotaWindow(Date.UTC(2026, 11, 31, 23, 59, 59));
  assert.equal(december.monthStart, "2026-12-01");
  assert.equal(december.resetAt, "2027-01-01T00:00:00.000Z");
});

test("Try On quota snapshots clamp usage at the configured limit", () => {
  const quota = customerTryOnQuotaSnapshot(999, Date.UTC(2026, 9, 5));
  assert.equal(quota.used, 50);
  assert.equal(quota.remaining, 0);
});
