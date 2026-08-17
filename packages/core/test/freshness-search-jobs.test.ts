import test from "node:test";
import assert from "node:assert/strict";
import {
  BackgroundWorker,
  InMemoryScheduledJobStore,
  LocalSearchEngine,
  ScheduledJobRunner,
  SearchIndexingService,
  StockFreshnessMonitor,
  StockFreshnessPolicy,
  TransactionalOutbox,
  money,
  offerStockIsFresh,
  type SupplierOffer
} from "../src/index.ts";

function supplierOffer(input: Partial<SupplierOffer> = {}): SupplierOffer {
  return {
    offerId: "offer-a",
    vendorId: "vendor-a",
    locationId: "loc-a",
    canonicalVariantId: "cv-a",
    marketId: "sparta",
    approved: true,
    vendorActive: true,
    locationActive: true,
    productAllowed: true,
    availableToSell: 4,
    stockFresh: true,
    canServe: true,
    costWithinCeiling: true,
    capacityOpen: true,
    fulfilmentMode: "pickup",
    fulfilmentFit: 1,
    stockConfirmedAt: 100,
    supplierUnitPrice: money(1000),
    ...input
  };
}

test("category-aware stock freshness removes stale offers from eligibility without hard-coded 24h logic", () => {
  const policy = new StockFreshnessPolicy({ defaultTtlMs: 1000, defaultReminderLeadMs: 200, categoryRules: { electronics: { ttlMs: 100, reminderLeadMs: 20 } } });
  const offer = supplierOffer({ stockConfirmedAt: 100, stockTtlMs: 100 });
  assert.equal(policy.state({ confirmedAt: 100, categoryCode: "electronics", now: 179 }), "fresh");
  assert.equal(policy.state({ confirmedAt: 100, categoryCode: "electronics", now: 185 }), "due_soon");
  assert.equal(policy.state({ confirmedAt: 100, categoryCode: "electronics", now: 200 }), "stale");
  assert.equal(offerStockIsFresh(offer, 199), true);
  assert.equal(offerStockIsFresh(offer, 201), false);
});

test("freshness monitor emits transitions once and recovers after merchant confirmation", () => {
  const monitor = new StockFreshnessMonitor(new StockFreshnessPolicy({ defaultTtlMs: 100, defaultReminderLeadMs: 20 }));
  monitor.register({ offerId: "offer-a", vendorId: "vendor-a", canonicalVariantId: "cv-a", categoryCode: "electronics", confirmedAt: 100 });
  assert.equal(monitor.scan(150)[0]?.state, "fresh");
  assert.equal(monitor.scan(170).length, 0);
  assert.equal(monitor.scan(185)[0]?.state, "due_soon");
  assert.equal(monitor.scan(201)[0]?.state, "stale");
  const recovered = monitor.confirm("offer-a", 220);
  assert.equal(recovered.previousState, "stale");
  assert.equal(recovered.state, "fresh");
});

test("search indexer hashes projections and removes suppressed canonicals", async () => {
  const engine = new LocalSearchEngine();
  let suppressed = false;
  const indexer = new SearchIndexingService({
    backend: engine,
    resolver: (id) => suppressed ? undefined : ({ id, type: "product", marketId: "sparta", title: "Τοπικό Φωτιστικό", available: true })
  });
  const first = await indexer.reindex("cv-a", 100);
  assert.equal(first.action, "upserted");
  assert.equal(engine.document("cv-a")?.title, "Τοπικό Φωτιστικό");
  assert.equal((await indexer.reindex("cv-a", 101)).action, "unchanged");
  suppressed = true;
  assert.equal((await indexer.reindex("cv-a", 102)).action, "removed");
  assert.equal(engine.document("cv-a"), undefined);
});

test("outbox supports multiple subscribers and enforces worker lease ownership", async () => {
  const outbox = new TransactionalOutbox();
  const effects: string[] = [];
  const worker = new BackgroundWorker({ outbox, workerId: "worker-a", leaseMs: 1000 });
  worker.register("inventory.changed", () => effects.push("search"));
  worker.register("inventory.changed", () => effects.push("notification"));
  outbox.enqueue({ type: "inventory.changed", aggregateType: "offer", aggregateId: "offer-a", payload: {}, idempotencyKey: "inv-a", now: 100 });
  assert.deepEqual(await worker.runOnce(100), { claimed: 1, processed: 1, retried: 0, deadLettered: 0 });
  assert.deepEqual(effects, ["search", "notification"]);

  const second = outbox.enqueue({ type: "inventory.changed", aggregateType: "offer", aggregateId: "offer-b", payload: {}, idempotencyKey: "inv-b", now: 200 });
  const claimed = outbox.claim(200, 1, 1000, ["inventory.changed"], "worker-a");
  assert.equal(claimed[0]?.id, second.id);
  assert.throws(() => outbox.complete(second.id, 201, "worker-b"), /another worker/);
});

test("scheduled jobs use leases so two workers cannot run the same due task", async () => {
  const store = new InMemoryScheduledJobStore();
  let runs = 0;
  const a = new ScheduledJobRunner({ store, ownerId: "scheduler-a", leaseMs: 100 });
  const b = new ScheduledJobRunner({ store, ownerId: "scheduler-b", leaseMs: 100 });
  for (const runner of [a, b]) runner.register({ name: "stock-freshness", intervalMs: 1000, run: () => { runs += 1; } });
  const [ra, rb] = await Promise.all([a.runDue(100), b.runDue(100)]);
  assert.equal(ra.claimed + rb.claimed, 1);
  assert.equal(runs, 1);
  assert.equal((await a.runDue(500)).claimed, 0);
  assert.equal((await b.runDue(1100)).claimed, 1);
  assert.equal(runs, 2);
});
