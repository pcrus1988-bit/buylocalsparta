import assert from "node:assert/strict";
import test from "node:test";
import {
  DROPSHIPPING_CATALOGUE_STALE_AFTER_MINUTES,
  DROPSHIPPING_HEALTHCHECK_STALE_AFTER_MINUTES,
  dropshippingFeedHealth
} from "../src/lib/dropshipping-feed-health.ts";

const now = Date.parse("2026-09-12T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

test("reports healthy only when supplier, healthcheck and catalogue sync are current", () => {
  assert.equal(dropshippingFeedHealth({
    active: true,
    catalogueSyncEnabled: true,
    lastHealthcheckAt: minutesAgo(5),
    lastHealthcheckOk: true,
    lastCatalogueSyncAt: minutesAgo(10)
  }, now).status, "healthy");
});

test("failed healthcheck takes precedence over fresh catalogue timestamps", () => {
  assert.equal(dropshippingFeedHealth({
    active: true,
    catalogueSyncEnabled: true,
    lastHealthcheckAt: minutesAgo(1),
    lastHealthcheckOk: false,
    lastCatalogueSyncAt: minutesAgo(1)
  }, now).status, "degraded");
});

test("flags stale healthcheck and catalogue data", () => {
  assert.equal(dropshippingFeedHealth({
    active: true,
    catalogueSyncEnabled: true,
    lastHealthcheckAt: minutesAgo(DROPSHIPPING_HEALTHCHECK_STALE_AFTER_MINUTES + 1),
    lastHealthcheckOk: true,
    lastCatalogueSyncAt: minutesAgo(5)
  }, now).status, "stale");

  assert.equal(dropshippingFeedHealth({
    active: true,
    catalogueSyncEnabled: true,
    lastHealthcheckAt: minutesAgo(5),
    lastHealthcheckOk: true,
    lastCatalogueSyncAt: minutesAgo(DROPSHIPPING_CATALOGUE_STALE_AFTER_MINUTES + 1)
  }, now).status, "stale");
});

test("does not present missing telemetry as healthy", () => {
  assert.equal(dropshippingFeedHealth({
    active: true,
    catalogueSyncEnabled: true,
    lastHealthcheckAt: null,
    lastHealthcheckOk: null,
    lastCatalogueSyncAt: minutesAgo(5)
  }, now).status, "unknown");

  assert.equal(dropshippingFeedHealth({
    active: true,
    catalogueSyncEnabled: true,
    lastHealthcheckAt: null,
    lastHealthcheckOk: null,
    lastCatalogueSyncAt: null
  }, now).status, "unknown");
});

test("reports intentionally disabled feeds separately", () => {
  assert.equal(dropshippingFeedHealth({
    active: false,
    catalogueSyncEnabled: true,
    lastHealthcheckAt: minutesAgo(5),
    lastHealthcheckOk: true,
    lastCatalogueSyncAt: minutesAgo(5)
  }, now).status, "disabled");
});
