import test from "node:test";
import assert from "node:assert/strict";
import { CustomerRecommendationService, SavedProductAlertService, SavedSearchService } from "../src/index.ts";

test("saved-product alerts baseline current state and notify only on later transitions", () => {
  const service = new SavedProductAlertService();
  const pref = service.configure({
    userId: "u1", canonicalVariantId: "p1", backInStockEnabled: true, priceDropEnabled: true,
    minimumPriceDropMinor: 100, currentAvailable: false, currentPriceMinor: 1_500, now: 100
  });
  assert.equal(service.reconcileProduct({ canonicalVariantId: "p1", available: false, priceMinor: 1_500, now: 200 }).length, 0);
  const back = service.reconcileProduct({ canonicalVariantId: "p1", available: true, priceMinor: 1_500, now: 300 });
  assert.equal(back.length, 1);
  assert.equal(back[0].type, "back_in_stock");
  const tooSmall = service.reconcileProduct({ canonicalVariantId: "p1", available: true, priceMinor: 1_450, now: 400 });
  assert.equal(tooSmall.length, 0);
  const drop = service.reconcileProduct({ canonicalVariantId: "p1", available: true, priceMinor: 1_300, now: 500 });
  assert.equal(drop.length, 1);
  assert.equal(drop[0].type, "price_drop");
  assert.equal(drop[0].priceDropMinor, 150);
  assert.equal(service.eventsForUser("u1").length, 2);
  assert.equal(service.preference("u1", "p1")?.id, pref.id);
});

test("changing saved-product alert preferences re-baselines and deletion clears watches", () => {
  const service = new SavedProductAlertService();
  service.configure({ userId: "u1", canonicalVariantId: "p1", priceDropEnabled: false, currentAvailable: true, currentPriceMinor: 1_500, now: 100 });
  service.reconcileProduct({ canonicalVariantId: "p1", available: true, priceMinor: 1_000, now: 200 });
  service.configure({ userId: "u1", canonicalVariantId: "p1", priceDropEnabled: true, currentAvailable: true, currentPriceMinor: 1_000, now: 300 });
  assert.equal(service.reconcileProduct({ canonicalVariantId: "p1", available: true, priceMinor: 800, now: 301 }).length, 1);
  assert.equal(service.eventsForUser("u1").length, 1);
  assert.equal(service.productIds().includes("p1"), true);
  assert.equal(service.clearUser("u1"), 1);
  assert.equal(service.forUser("u1").length, 0);
  assert.equal(service.eventsForUser("u1").length, 0);
});

test("saved searches baseline current canonical matches and only alert on genuinely new matches", () => {
  const service = new SavedSearchService();
  const saved = service.create({ userId: "u1", marketId: "sparta", name: "Desk lamps", query: { q: "lamp", availability: "in_stock" }, currentCanonicalVariantIds: ["p1"], now: 100 });
  assert.equal(service.reconcile({ searchId: saved.id, currentCanonicalVariantIds: ["p1"], now: 200 }).length, 0);
  const events = service.reconcile({ searchId: saved.id, currentCanonicalVariantIds: ["p1", "p2"], now: 300 });
  assert.equal(events.length, 1);
  assert.equal(events[0].canonicalVariantId, "p2");
  assert.equal(service.reconcile({ searchId: saved.id, currentCanonicalVariantIds: ["p2"], now: 400 }).length, 0);
  assert.equal(service.reconcile({ searchId: saved.id, currentCanonicalVariantIds: ["p1", "p2"], now: 500 }).length, 0, "previously seen matches must not re-alert after temporary disappearance");
});

test("saved-search alerts can be disabled and re-enabled without firing historical matches", () => {
  const service = new SavedSearchService();
  const saved = service.create({ userId: "u1", marketId: "sparta", query: { q: "gift" }, currentCanonicalVariantIds: [], now: 100 });
  service.configure({ searchId: saved.id, userId: "u1", alertsEnabled: false, currentCanonicalVariantIds: ["p1"], now: 200 });
  assert.equal(service.reconcile({ searchId: saved.id, currentCanonicalVariantIds: ["p1", "p2"], now: 300 }).length, 0);
  service.configure({ searchId: saved.id, userId: "u1", alertsEnabled: true, currentCanonicalVariantIds: ["p1", "p2"], now: 400 });
  assert.equal(service.reconcile({ searchId: saved.id, currentCanonicalVariantIds: ["p1", "p2"], now: 401 }).length, 0);
  assert.equal(service.reconcile({ searchId: saved.id, currentCanonicalVariantIds: ["p1", "p2", "p3"], now: 500 }).length, 1);
});

test("saved-search editing preserves identity, enforces ownership and re-baselines edited criteria", () => {
  const service = new SavedSearchService();
  const saved = service.create({ userId: "u1", marketId: "sparta", name: "Old name", query: { q: "gift" }, currentCanonicalVariantIds: ["p1"], now: 100 });
  assert.throws(() => service.update({ searchId: saved.id, userId: "u2", name: "Nope", query: { q: "lamp" }, currentCanonicalVariantIds: ["p2"], now: 150 }), /ownership/i);
  const updated = service.update({ searchId: saved.id, userId: "u1", name: "  Desk   lamps  ", query: { q: "  lamp  ", categoryCode: "home-living", availability: "in_stock" }, currentCanonicalVariantIds: ["p2", "p3"], now: 200 });
  assert.equal(updated.id, saved.id);
  assert.equal(updated.createdAt, saved.createdAt);
  assert.equal(updated.name, "Desk lamps");
  assert.equal(updated.query.q, "lamp");
  assert.equal(updated.query.categoryCode, "home-living");
  assert.deepEqual(updated.seenCanonicalVariantIds, ["p2", "p3"]);
  assert.equal(updated.lastObservedCount, 2);
  assert.equal(service.reconcile({ searchId: saved.id, currentCanonicalVariantIds: ["p2", "p3"], now: 201 }).length, 0);
  const events = service.reconcile({ searchId: saved.id, currentCanonicalVariantIds: ["p2", "p3", "p4"], now: 300 });
  assert.equal(events.length, 1);
  assert.equal(events[0].canonicalVariantId, "p4");
});

test("recommendations use canonical public metadata, explanations and diversity limits", () => {
  const service = new CustomerRecommendationService();
  const products = [
    { canonicalVariantId: "saved", categoryCode: "tech", brand: "Apple", available: true },
    { canonicalVariantId: "a1", categoryCode: "tech", brand: "Apple", available: true, adviceAvailable: true },
    { canonicalVariantId: "a2", categoryCode: "tech", brand: "Apple", available: true },
    { canonicalVariantId: "a3", categoryCode: "tech", brand: "Apple", available: true },
    { canonicalVariantId: "home1", categoryCode: "home", brand: "Demo", available: true },
    { canonicalVariantId: "paper1", categoryCode: "paper", brand: "Paper", available: true },
    { canonicalVariantId: "unavailable", categoryCode: "tech", brand: "Apple", available: false }
  ];
  const saved = [{ canonicalVariantId: "saved", categoryCode: "tech", brand: "Apple" }];
  const recent = [{ canonicalVariantId: "recent", categoryCode: "home", brand: "Demo", viewedAt: 1000 }, { canonicalVariantId: "recent-paper", categoryCode: "paper", brand: "Paper", viewedAt: 900 }];
  assert.deepEqual(service.recommend({ enabled: false, products, saved, recentlyViewed: recent }), []);
  const result = service.recommend({ enabled: true, products, saved, recentlyViewed: recent, limit: 6, maxPerBrand: 2, maxPerCategory: 3, locale: "el" });
  assert.equal(result[0].canonicalVariantId, "a1");
  assert.equal(result.some((item) => item.canonicalVariantId === "saved"), false);
  assert.equal(result.some((item) => item.canonicalVariantId === "unavailable"), false);
  assert.equal(result.filter((item) => ["a1", "a2", "a3"].includes(item.canonicalVariantId)).length, 2, "brand diversity cap should stop one brand dominating the list");
  assert.match(result[0].explanation, /κατηγορία|μάρκα/);
  assert.ok(result[0].reasons.includes("same_category_as_saved"));
});
