import assert from "node:assert/strict";
import test from "node:test";

import {
  mapNovaProviderStatus,
  preventStatusRegression,
  reconcileNovaDropshipOrders,
  type DropshipOrderReconciliationRepository,
  type DropshipReconciliationTarget,
  type ReconciledDropshipStatus
} from "../src/order-reconciliation.ts";
import type { NovaOrder } from "../src/nova-v1.ts";

const target: DropshipReconciliationTarget = {
  fulfilmentId: "dsf_1",
  externalOrderId: "nova_1001",
  storeId: 77,
  currentStatus: "supplier_confirmation"
};

type SyncCall = Readonly<{
  fulfilmentId: string;
  externalOrderId: string;
  providerStatus: string;
  status: ReconciledDropshipStatus;
  raw: NovaOrder;
  now: number;
}>;

function repository(
  targets: readonly DropshipReconciliationTarget[],
  options: { outcome?: "updated" | "unchanged" } = {}
): DropshipOrderReconciliationRepository & { synced: SyncCall[]; errors: string[] } {
  const synced: SyncCall[] = [];
  const errors: string[] = [];
  return {
    synced,
    errors,
    async listTargets() {
      return targets;
    },
    async markSynced(input) {
      synced.push(input);
      return options.outcome ?? "updated";
    },
    async markSyncError(_fulfilmentId, message) {
      errors.push(message);
    }
  };
}

test("reconciliation maps a Nova processing order to preparing and preserves raw payload", async () => {
  const repo = repository([target]);
  const remote: NovaOrder = {
    id: "nova_1001",
    status: "processing",
    tracking_info: [{ tracking_number: "TRACK-1", carrier: "DHL" }]
  };

  const result = await reconcileNovaDropshipOrders(
    repo,
    () => ({ async getOrder() { return remote; } }),
    { now: () => 1_700_000_000_000 }
  );

  assert.deepEqual(result, { checked: 1, updated: 1, unchanged: 0, failed: 0 });
  assert.equal(repo.synced.length, 1);
  assert.equal(repo.synced[0]?.providerStatus, "processing");
  assert.equal(repo.synced[0]?.status, "preparing");
  assert.deepEqual(repo.synced[0]?.raw, remote);
  assert.deepEqual(repo.errors, []);
});

test("reconciliation reports unchanged when repository finds no durable change", async () => {
  const repo = repository([target], { outcome: "unchanged" });
  const result = await reconcileNovaDropshipOrders(
    repo,
    () => ({ async getOrder() { return { id: "nova_1001", status: "pending" }; } }),
    { now: () => 1_700_000_000_000 }
  );

  assert.deepEqual(result, { checked: 1, updated: 0, unchanged: 1, failed: 0 });
});

test("reconciliation rejects a Nova response whose explicit order id does not match", async () => {
  const repo = repository([target]);
  const result = await reconcileNovaDropshipOrders(
    repo,
    () => ({ async getOrder() { return { id: "nova_other", status: "processing" }; } }),
    { now: () => 1_700_000_000_000 }
  );

  assert.deepEqual(result, { checked: 1, updated: 0, unchanged: 0, failed: 1 });
  assert.equal(repo.synced.length, 0);
  assert.equal(repo.errors.length, 1);
  assert.match(repo.errors[0] ?? "", /returned order nova_other while reconciling nova_1001/);
});

test("reconciliation records supplier read failures instead of mutating fulfilment state", async () => {
  const repo = repository([target]);
  const result = await reconcileNovaDropshipOrders(
    repo,
    () => ({ async getOrder() { throw new Error("supplier unavailable"); } }),
    { now: () => 1_700_000_000_000 }
  );

  assert.deepEqual(result, { checked: 1, updated: 0, unchanged: 0, failed: 1 });
  assert.equal(repo.synced.length, 0);
  assert.match(repo.errors[0] ?? "", /supplier unavailable/);
});

test("completed maps to shipped but cannot regress a delivered local fulfilment", () => {
  assert.equal(mapNovaProviderStatus("completed"), "shipped");
  assert.equal(preventStatusRegression("delivered", "shipped"), "delivered");
});

test("a shipped fulfilment does not regress when Nova temporarily reports processing", () => {
  assert.equal(preventStatusRegression("shipped", mapNovaProviderStatus("processing")), "shipped");
});

test("unknown Nova statuses fail closed to supplier confirmation rather than inventing a terminal state", () => {
  assert.equal(mapNovaProviderStatus("new-provider-state"), "supplier_confirmation");
});
