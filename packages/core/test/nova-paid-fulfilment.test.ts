import assert from "node:assert/strict";
import test from "node:test";
import {
  fulfilPaidDropshipOrder,
  type NovaPaidFulfilmentClient,
  type PaidDropshipClaim,
  type PaidDropshipRepository
} from "../../../integrations/dropship-suppliers/src/paid-fulfilment.ts";
import {
  NovaV1ApiError,
  NovaV1OrderSubmissionUncertainError,
  type NovaCreateOrderPayload,
  type NovaOrder,
  type NovaScalarId
} from "../../../integrations/dropship-suppliers/src/nova-v1.ts";

const CLAIM: PaidDropshipClaim = {
  fulfilmentId: "dsf_test",
  claimToken: "claim_test",
  idempotencyKey: "dropship:order_test:nova:default",
  storeId: 2,
  providerPayload: { order_reference: "ORDER-TEST" },
  lines: [{
    orderLineId: "line_test",
    externalProductId: "100",
    externalVariantId: "1001",
    quantity: 2,
    supplierUnitCostMinor: 5_500
  }]
};

type Recorded = { name: string; args: readonly unknown[] };

class FakeRepository implements PaidDropshipRepository {
  readonly calls: Recorded[] = [];
  readonly claims: readonly PaidDropshipClaim[];
  #claimsAvailable = true;

  constructor(claims: readonly PaidDropshipClaim[] = [CLAIM]) {
    this.claims = claims;
  }

  async claimQueued(orderId: string, now: number) {
    this.calls.push({ name: "claimQueued", args: [orderId, now] });
    if (!this.#claimsAvailable) return [];
    this.#claimsAvailable = false;
    return this.claims;
  }
  async markSubmissionStarted(...args: Parameters<PaidDropshipRepository["markSubmissionStarted"]>) { this.calls.push({ name: "markSubmissionStarted", args }); }
  async markOutOfStock(...args: Parameters<PaidDropshipRepository["markOutOfStock"]>) { this.calls.push({ name: "markOutOfStock", args }); }
  async markSupplierActionRequired(...args: Parameters<PaidDropshipRepository["markSupplierActionRequired"]>) { this.calls.push({ name: "markSupplierActionRequired", args }); }
  async markSupplierRejected(...args: Parameters<PaidDropshipRepository["markSupplierRejected"]>) { this.calls.push({ name: "markSupplierRejected", args }); }
  async markSubmissionUncertain(...args: Parameters<PaidDropshipRepository["markSubmissionUncertain"]>) { this.calls.push({ name: "markSubmissionUncertain", args }); }
  async markSubmitted(...args: Parameters<PaidDropshipRepository["markSubmitted"]>) { this.calls.push({ name: "markSubmitted", args }); }
}

function novaClient(input: {
  stockQuantity?: number;
  supplierCostMinor?: number;
  create?: () => Promise<NovaOrder>;
  createCalls?: NovaCreateOrderPayload[];
} = {}): NovaPaidFulfilmentClient {
  const createCalls = input.createCalls ?? [];
  const supplierCostMinor = input.supplierCostMinor ?? 5_500;
  return {
    async checkProductStatus(_storeId: NovaScalarId, productIds: readonly NovaScalarId[]) {
      return productIds.map((id) => ({ id, status: "publish" }));
    },
    async getProduct(_storeId: NovaScalarId, productId: NovaScalarId) {
      return {
        id: productId,
        variations: [{
          id: 1001,
          manage_stock: true,
          in_stock: true,
          stock_status: "instock",
          stock_quantity: input.stockQuantity ?? 5,
          sale_price: (supplierCostMinor / 100).toFixed(2),
          regular_price: "99.00"
        }]
      };
    },
    async createOrder(_storeId: NovaScalarId, payload: NovaCreateOrderPayload) {
      createCalls.push(payload);
      return input.create ? input.create() : { id: 77, status: "processing" };
    }
  };
}

const monotonicNow = (() => {
  let value = 1_000;
  return () => ++value;
})();

test("paid dropship fulfilment submits a claimed Nova order once and persists the external id", async () => {
  const repository = new FakeRepository();
  const createCalls: NovaCreateOrderPayload[] = [];
  const client = novaClient({ createCalls });

  const first = await fulfilPaidDropshipOrder(repository, client, "order_test", monotonicNow);
  const second = await fulfilPaidDropshipOrder(repository, client, "order_test", monotonicNow);

  assert.equal(createCalls.length, 1);
  assert.deepEqual(first, [{ fulfilmentId: "dsf_test", status: "submitted", externalOrderId: "77", providerStatus: "processing" }]);
  assert.deepEqual(second, []);
  assert.equal(repository.calls.filter((call) => call.name === "markSubmissionStarted").length, 1);
  assert.equal(repository.calls.filter((call) => call.name === "markSubmitted").length, 1);
});

test("stock loss after payment blocks Nova POST /orders", async () => {
  const repository = new FakeRepository();
  const createCalls: NovaCreateOrderPayload[] = [];
  const result = await fulfilPaidDropshipOrder(repository, novaClient({ stockQuantity: 1, createCalls }), "order_test", monotonicNow);

  assert.equal(createCalls.length, 0);
  assert.equal(result[0]?.status, "out_of_stock");
  assert.equal(repository.calls.filter((call) => call.name === "markOutOfStock").length, 1);
  assert.equal(repository.calls.filter((call) => call.name === "markSubmissionStarted").length, 0);
});

test("supplier cost increase after payment requires review and does not submit", async () => {
  const repository = new FakeRepository();
  const createCalls: NovaCreateOrderPayload[] = [];
  const result = await fulfilPaidDropshipOrder(repository, novaClient({ supplierCostMinor: 5_600, createCalls }), "order_test", monotonicNow);

  assert.equal(createCalls.length, 0);
  assert.equal(result[0]?.status, "supplier_action_required");
  assert.match(result[0]?.message ?? "", /supplier cost changed/);
});

test("definitive Nova 4xx rejection is persisted without automatic retry", async () => {
  const repository = new FakeRepository();
  const createCalls: NovaCreateOrderPayload[] = [];
  const client = novaClient({
    createCalls,
    create: async () => { throw new NovaV1ApiError({ status: 422, method: "POST", path: "/orders", message: "invalid order" }); }
  });

  const first = await fulfilPaidDropshipOrder(repository, client, "order_test", monotonicNow);
  const second = await fulfilPaidDropshipOrder(repository, client, "order_test", monotonicNow);

  assert.equal(createCalls.length, 1);
  assert.equal(first[0]?.status, "supplier_rejected");
  assert.deepEqual(second, []);
  assert.equal(repository.calls.filter((call) => call.name === "markSupplierRejected").length, 1);
});

test("ambiguous Nova submission becomes submission_uncertain and is never automatically repeated", async () => {
  const repository = new FakeRepository();
  const createCalls: NovaCreateOrderPayload[] = [];
  const client = novaClient({
    createCalls,
    create: async () => { throw new NovaV1OrderSubmissionUncertainError(new Error("socket closed")); }
  });

  const first = await fulfilPaidDropshipOrder(repository, client, "order_test", monotonicNow);
  const second = await fulfilPaidDropshipOrder(repository, client, "order_test", monotonicNow);

  assert.equal(createCalls.length, 1);
  assert.equal(first[0]?.status, "submission_uncertain");
  assert.deepEqual(second, []);
  assert.equal(repository.calls.filter((call) => call.name === "markSubmissionUncertain").length, 1);
});

test("a successful Nova response without an order id is treated as uncertain", async () => {
  const repository = new FakeRepository();
  const result = await fulfilPaidDropshipOrder(repository, novaClient({ create: async () => ({ status: "processing" }) }), "order_test", monotonicNow);

  assert.equal(result[0]?.status, "submission_uncertain");
  assert.match(result[0]?.message ?? "", /no usable order id/);
  assert.equal(repository.calls.filter((call) => call.name === "markSubmitted").length, 0);
});

test("multiple claimed warehouses are isolated so one blocked claim does not create duplicate mutation state", async () => {
  const secondClaim: PaidDropshipClaim = {
    ...CLAIM,
    fulfilmentId: "dsf_second",
    claimToken: "claim_second",
    idempotencyKey: "dropship:order_test:nova:warehouse-2",
    lines: [{ ...CLAIM.lines[0]!, externalProductId: "200", externalVariantId: "2001" }]
  };
  const repository = new FakeRepository([CLAIM, secondClaim]);
  const createCalls: NovaCreateOrderPayload[] = [];
  const client = novaClient({ createCalls });
  const originalGetProduct = client.getProduct.bind(client);
  client.getProduct = async (storeId, productId, lang) => {
    if (String(productId) === "200") {
      return { id: productId, variations: [{ id: 2001, manage_stock: true, in_stock: false, stock_status: "outofstock", stock_quantity: 0, sale_price: "55.00" }] };
    }
    return originalGetProduct(storeId, productId, lang);
  };

  const result = await fulfilPaidDropshipOrder(repository, client, "order_test", monotonicNow);

  assert.equal(createCalls.length, 1);
  assert.deepEqual(result.map((item) => item.status), ["submitted", "out_of_stock"]);
});
