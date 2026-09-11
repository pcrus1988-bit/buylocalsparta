import assert from "node:assert/strict";
import test from "node:test";

import {
  fulfilPaidDropshipOrder,
  type NovaPaidFulfilmentClient,
  type PaidDropshipClaim,
  type PaidDropshipRepository
} from "../src/paid-fulfilment.ts";
import { NovaV1ApiError, type NovaOrder, type NovaProduct } from "../src/nova-v1.ts";

const claim: PaidDropshipClaim = {
  fulfilmentId: "ful_1",
  claimToken: "claim_1",
  idempotencyKey: "km-order-1:nova",
  storeId: 77,
  providerPayload: { order_number: "KM-1", billing: { country: "GR" } },
  lines: [{
    orderLineId: "line_1",
    externalProductId: "product_1",
    externalVariantId: "variant_1",
    quantity: 1,
    supplierUnitCostMinor: 1000
  }]
};

function liveProduct(): NovaProduct {
  return {
    id: "product_1",
    variations: [{
      id: "variant_1",
      manage_stock: true,
      in_stock: true,
      stock_status: "instock",
      stock_quantity: 4,
      sale_price: "10.00",
      regular_price: "12.00"
    }]
  };
}

function clientThrowing(error: unknown, attempts: { count: number }): NovaPaidFulfilmentClient {
  return {
    async checkProductStatus() {
      return [{ id: "product_1", status: "publish" }];
    },
    async getProduct() {
      return liveProduct();
    },
    async createOrder(): Promise<NovaOrder> {
      attempts.count += 1;
      throw error;
    }
  };
}

type Event =
  | { kind: "started" }
  | { kind: "rejected"; error: NovaV1ApiError }
  | { kind: "uncertain"; raw: unknown }
  | { kind: "submitted" }
  | { kind: "out_of_stock" }
  | { kind: "supplier_action_required" };

function repository(events: Event[]): PaidDropshipRepository {
  return {
    async claimQueued() {
      return [claim];
    },
    async markSubmissionStarted() {
      events.push({ kind: "started" });
    },
    async markOutOfStock() {
      events.push({ kind: "out_of_stock" });
    },
    async markSupplierActionRequired() {
      events.push({ kind: "supplier_action_required" });
    },
    async markSupplierRejected(_fulfilmentId, _claimToken, error) {
      events.push({ kind: "rejected", error });
    },
    async markSubmissionUncertain(_fulfilmentId, _claimToken, _message, raw) {
      events.push({ kind: "uncertain", raw });
    },
    async markSubmitted() {
      events.push({ kind: "submitted" });
    }
  };
}

function reusableNovaApiError(status: number): Error {
  const error = new Error(`Reusable Nova API rejected with ${status}`);
  error.name = "NovaApiError";
  Object.assign(error, { status, method: "POST", path: "/orders" });
  return error;
}

function reusableUncertainError(cause: unknown): Error {
  const error = new Error("Nova order submission outcome is uncertain; reconciliation is required");
  error.name = "NovaOrderSubmissionUncertainError";
  Object.assign(error, { originalError: cause });
  return error;
}

test("paid fulfilment treats reusable NovaApiError 4xx as a definite supplier rejection", async () => {
  const events: Event[] = [];
  const attempts = { count: 0 };

  const outcomes = await fulfilPaidDropshipOrder(
    repository(events),
    clientThrowing(reusableNovaApiError(400), attempts),
    "order_1",
    () => 1_700_000_000_000
  );

  assert.equal(attempts.count, 1);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0]?.status, "supplier_rejected");
  assert.deepEqual(events.map((event) => event.kind), ["started", "rejected"]);

  const rejected = events.find((event): event is Extract<Event, { kind: "rejected" }> => event.kind === "rejected");
  assert.ok(rejected);
  assert.ok(rejected.error instanceof NovaV1ApiError);
  assert.equal(rejected.error.status, 400);
  assert.equal(rejected.error.method, "POST");
  assert.equal(rejected.error.path, "/orders");
});

test("paid fulfilment preserves reusable uncertain submission as reconciliation-required", async () => {
  const events: Event[] = [];
  const attempts = { count: 0 };
  const cause = reusableNovaApiError(503);

  const outcomes = await fulfilPaidDropshipOrder(
    repository(events),
    clientThrowing(reusableUncertainError(cause), attempts),
    "order_1",
    () => 1_700_000_000_000
  );

  assert.equal(attempts.count, 1);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0]?.status, "submission_uncertain");
  assert.deepEqual(events.map((event) => event.kind), ["started", "uncertain"]);

  const uncertain = events.find((event): event is Extract<Event, { kind: "uncertain" }> => event.kind === "uncertain");
  assert.ok(uncertain);
  assert.deepEqual(uncertain.raw, {
    name: "NovaApiError",
    message: "Reusable Nova API rejected with 503",
    status: 503,
    method: "POST",
    path: "/orders"
  });
});

test("paid fulfilment fails closed on an unknown post-submit error and never retries", async () => {
  const events: Event[] = [];
  const attempts = { count: 0 };

  const outcomes = await fulfilPaidDropshipOrder(
    repository(events),
    clientThrowing(new Error("unexpected socket failure"), attempts),
    "order_1",
    () => 1_700_000_000_000
  );

  assert.equal(attempts.count, 1);
  assert.equal(outcomes[0]?.status, "submission_uncertain");
  assert.deepEqual(events.map((event) => event.kind), ["started", "uncertain"]);
});
