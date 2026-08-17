import test from "node:test";
import assert from "node:assert/strict";
import { BackgroundWorker, InventoryEngine, MaintenanceJobs, TransactionalOutbox } from "../src/index.ts";

test("background worker processes registered outbox events and retries failures with dead-letter cutoff", async () => {
  const outbox = new TransactionalOutbox();
  let handled = 0;
  const worker = new BackgroundWorker({ outbox, maxAttempts: 2, baseRetryMs: 10 });
  worker.register("ok", () => { handled += 1; });
  worker.register("fail", () => { throw new Error("provider down"); });
  outbox.enqueue({ type: "ok", aggregateType: "test", aggregateId: "1", payload: {}, idempotencyKey: "ok-1", now: 100 });
  outbox.enqueue({ type: "fail", aggregateType: "test", aggregateId: "2", payload: {}, idempotencyKey: "fail-1", now: 100 });
  const first = await worker.runOnce(100);
  assert.deepEqual(first, { claimed: 2, processed: 1, retried: 1, deadLettered: 0 });
  assert.equal(handled, 1);
  assert.equal((await worker.runOnce(105)).claimed, 0);
  const second = await worker.runOnce(110);
  assert.equal(second.deadLettered, 1);
  const failed = outbox.events().find((event) => event.type === "fail");
  assert.equal(failed?.status, "dead_lettered");
  outbox.replay(failed!.id, 200);
  assert.equal(outbox.events().find((event) => event.id === failed!.id)?.status, "pending");
});

test("maintenance jobs expire stock reservations without making Redis a source of truth", async () => {
  const inventory = new InventoryEngine();
  inventory.seed({ offerId: "offer-a", onHand: 3, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 0 });
  inventory.reserve({ offerId: "offer-a", quantity: 2, checkoutKey: "checkout", now: 100, ttlMs: 50 });
  const jobs = new MaintenanceJobs();
  jobs.register("reservation_expiry", (now) => inventory.expire(now));
  assert.equal(inventory.availableToSell("offer-a"), 1);
  const result = await jobs.run(151);
  assert.equal(result.reservation_expiry, 1);
  assert.equal(inventory.availableToSell("offer-a"), 3);
});
