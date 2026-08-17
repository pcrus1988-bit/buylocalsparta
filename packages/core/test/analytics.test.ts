import test from "node:test";
import assert from "node:assert/strict";
import { AnalyticsService, can, sanitizeAnalyticsSearchQuery } from "../src/index.ts";

test("search analytics redacts common personal identifiers while preserving product identifiers", () => {
  const email = sanitizeAnalyticsSearchQuery("στείλε στο maria@example.com για φωτιστικό");
  assert.equal(email.query.includes("maria@example.com"), false);
  assert.equal(email.query.includes("[email]"), true);
  const phone = sanitizeAnalyticsSearchQuery("πάρε 2731025844 για λάμπα");
  assert.equal(phone.query.includes("2731025844"), false);
  assert.equal(phone.query.includes("[phone]"), true);
  const gtin = sanitizeAnalyticsSearchQuery("0195949052637");
  assert.equal(gtin.query, "0195949052637");
});

test("market analytics reports search success, unique-search CTR, zero-result demand and category demand", () => {
  const service = new AnalyticsService();
  const a = service.recordSearch({ marketId: "sparta", query: "φωτιστικό", resultCount: 5, filters: { categoryCode: "lighting-decor" }, visitorKey: "visitor-a", now: 100 });
  service.recordSearchClick({ searchEventId: a.id, entityId: "cv-lamp", entityType: "product", position: 0, visitorKey: "visitor-a", now: 110 });
  // A second entity click from the same search must not inflate search-session CTR above 100%.
  service.recordSearchClick({ searchEventId: a.id, entityId: "cv-lamp-2", entityType: "product", position: 1, visitorKey: "visitor-a", now: 111 });
  service.recordSearch({ marketId: "sparta", query: "σπάνιο ανταλλακτικό", resultCount: 0, filters: { categoryCode: "auto-parts" }, visitorKey: "visitor-b", now: 120 });
  service.record({ eventName: "product.viewed", marketId: "sparta", canonicalVariantId: "cv-lamp", vendorId: "vendor-a", visitorKey: "visitor-a", metadata: { categoryCode: "lighting-decor" }, now: 130 });
  service.record({ eventName: "cart.item_added", marketId: "sparta", canonicalVariantId: "cv-lamp", vendorId: "vendor-a", visitorKey: "visitor-a", metadata: { categoryCode: "lighting-decor" }, now: 140 });

  const report = service.marketReport({ marketId: "sparta", from: 0, to: 1_000 });
  assert.equal(report.searches, 2);
  assert.equal(report.successfulSearches, 1);
  assert.equal(report.zeroResultSearches, 1);
  assert.equal(report.searchSuccessRate, 0.5);
  assert.equal(report.searchClickThroughRate, 0.5);
  assert.equal(report.topQueries.find((row) => row.query === "φωτιστικό")?.clicks, 2);
  assert.equal(report.topQueries.find((row) => row.query === "φωτιστικό")?.clickThroughRate, 1);
  assert.equal(report.topZeroResultQueries[0]?.query, "σπάνιο ανταλλακτικό");
  assert.deepEqual(report.categoryDemand.find((row) => row.categoryCode === "lighting-decor"), { categoryCode: "lighting-decor", searches: 1, productViews: 1, cartAdds: 1 });
});

test("search click attribution cannot be forged by another visitor", () => {
  const service = new AnalyticsService();
  const search = service.recordSearch({ marketId: "sparta", query: "airpods", resultCount: 1, visitorKey: "visitor-a", now: 10 });
  assert.throws(() => service.recordSearchClick({ searchEventId: search.id, entityId: "cv-airpods", entityType: "product", position: 0, visitorKey: "visitor-b", now: 11 }), /attribution mismatch/i);
});

test("vendor analytics contains only the requested vendor aggregate and no competitor events", () => {
  const service = new AnalyticsService();
  service.record({ eventName: "product.impression", marketId: "sparta", vendorId: "vendor-a", canonicalVariantId: "cv-a", visitorKey: "v", now: 10 });
  service.record({ eventName: "order.vendor_attributed", marketId: "sparta", vendorId: "vendor-a", orderId: "order-1", valueMinor: 12_900, quantity: 1, now: 20 });
  service.record({ eventName: "order.vendor_attributed", marketId: "sparta", vendorId: "vendor-b", orderId: "order-2", valueMinor: 99_900, quantity: 7, now: 30 });
  const report = service.vendorReport({ marketId: "sparta", vendorId: "vendor-a", from: 0, to: 100 });
  assert.equal(report.vendorId, "vendor-a");
  assert.equal(report.qualifiedImpressions, 1);
  assert.equal(report.attributedOrders, 1);
  assert.equal(report.attributedRetailSalesMinor, 12_900);
  assert.equal(JSON.stringify(report).includes("vendor-b"), false);
  assert.equal(JSON.stringify(report).includes("99900"), false);
});

test("analytics enforces integer money, deduplication and retention", () => {
  const service = new AnalyticsService();
  assert.throws(() => service.record({ eventName: "checkout.authorised", marketId: "sparta", valueMinor: 10.5, now: 1 }), /integer minor units/i);
  const first = service.record({ eventName: "cart.item_added", marketId: "sparta", dedupeKey: "same", now: 10 });
  const second = service.record({ eventName: "cart.item_added", marketId: "sparta", dedupeKey: "same", now: 20 });
  assert.equal(second.id, first.id);
  assert.equal(service.purgeBefore(11), 1);
  assert.equal(service.events().length, 0);
  const afterPurge = service.record({ eventName: "cart.item_added", marketId: "sparta", dedupeKey: "same", now: 30 });
  assert.notEqual(afterPurge.id, first.id);
});

test("analytics permissions separate vendor aggregates from market intelligence", () => {
  assert.equal(can("vendor_owner", "analytics.vendor.read"), true);
  assert.equal(can("vendor_catalog", "analytics.vendor.read"), false);
  assert.equal(can("vendor_owner", "analytics.market.read"), false);
  assert.equal(can("content_seo", "analytics.market.read"), true);
  assert.equal(can("customer_support", "analytics.market.read"), false);
  assert.equal(can("compliance", "analytics.market.read"), false);
});
