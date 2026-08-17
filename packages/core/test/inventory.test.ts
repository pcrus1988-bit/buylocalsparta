import test from "node:test";
import assert from "node:assert/strict";
import { InventoryEngine } from "../src/index.ts";

test("reservation prevents oversell and expires safely", () => {
  const inventory = new InventoryEngine();
  inventory.seed({ offerId: "offer-a", onHand: 5, activeReservations: 0, safetyStock: 1, blocked: 0, updatedAt: 0 });
  const reservation = inventory.reserve({ offerId: "offer-a", quantity: 4, checkoutKey: "c1", now: 1_000, ttlMs: 10 });
  assert.equal(inventory.availableToSell("offer-a"), 0);
  assert.throws(() => inventory.reserve({ offerId: "offer-a", quantity: 1, checkoutKey: "c2", now: 1_001 }));
  inventory.expire(1_011);
  assert.equal(inventory.availableToSell("offer-a"), 4);
  assert.equal(inventory.reservations().find((r) => r.id === reservation.id)?.status, "expired");
});

test("idempotent reservation replay does not double reserve", () => {
  const inventory = new InventoryEngine();
  inventory.seed({ offerId: "offer-a", onHand: 10, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 0 });
  const a = inventory.reserve({ offerId: "offer-a", quantity: 2, checkoutKey: "same", now: 1_000 });
  const b = inventory.reserve({ offerId: "offer-a", quantity: 2, checkoutKey: "same", now: 1_001 });
  assert.equal(a.id, b.id);
  assert.equal(inventory.balance("offer-a").activeReservations, 2);
});
