import assert from "node:assert/strict";
import test from "node:test";
import {
  revalidateNovaCheckoutStock,
  type NovaCheckoutReadClient
} from "../../../integrations/dropship-suppliers/src/nova-checkout-revalidation.ts";
import type { NovaProduct, NovaScalarId } from "../../../integrations/dropship-suppliers/src/nova-v1.ts";

const PASSING_VARIANT = {
  id: 1001,
  sku: "SKU-1001",
  manage_stock: true,
  in_stock: true,
  stock_status: "instock",
  stock_quantity: 4,
  sale_price: "55.00",
  regular_price: "99.00"
} as const;

function product(overrides: Partial<NovaProduct> = {}): NovaProduct {
  return {
    id: 100,
    name: "Example",
    sale_price: "60.00",
    regular_price: "110.00",
    variations: [PASSING_VARIANT],
    ...overrides
  };
}

function client(input: {
  statuses?: readonly Readonly<Record<string, unknown>>[];
  product?: NovaProduct;
  calls?: string[];
} = {}): NovaCheckoutReadClient {
  const calls = input.calls ?? [];
  return {
    async checkProductStatus(storeId: NovaScalarId, productIds: readonly NovaScalarId[]) {
      calls.push(`status:${String(storeId)}:${productIds.map(String).join(",")}`);
      return input.statuses ?? [{ id: 100, status: "publish" }];
    },
    async getProduct(storeId: NovaScalarId, productId: NovaScalarId) {
      calls.push(`product:${String(storeId)}:${String(productId)}`);
      return input.product ?? product();
    }
  };
}

const INPUT = {
  storeId: 7,
  externalProductId: "100",
  externalVariantId: "1001",
  quantity: 2
} as const;

test("checkout revalidation follows check-status then exact product lookup and accepts a strict in-stock variant", async () => {
  const calls: string[] = [];
  const result = await revalidateNovaCheckoutStock(client({ calls }), INPUT, () => 123456);

  assert.deepEqual(calls, ["status:7:100", "product:7:100"]);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.blockReasons, []);
  assert.equal(result.checkedAt, 123456);
  assert.equal(result.availableQuantity, 4);
  assert.equal(result.supplierCostMinor, 5_500);
  assert.equal(result.msrpMinor, 9_900);
});

test("non-publish supplier status blocks checkout before the exact product request", async () => {
  const calls: string[] = [];
  const result = await revalidateNovaCheckoutStock(
    client({ statuses: [{ id: 100, status: "draft" }], calls }),
    INPUT
  );

  assert.deepEqual(calls, ["status:7:100"]);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockReasons, ["product-status-not-publish"]);
});

test("missing product status evidence blocks checkout without guessing availability", async () => {
  const calls: string[] = [];
  const result = await revalidateNovaCheckoutStock(client({ statuses: [], calls }), INPUT);

  assert.deepEqual(calls, ["status:7:100"]);
  assert.deepEqual(result.blockReasons, ["product-status-missing"]);
});

test("exact product identity mismatch is rejected", async () => {
  const result = await revalidateNovaCheckoutStock(
    client({ product: product({ id: 999 }) }),
    INPUT
  );

  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockReasons, ["product-id-mismatch"]);
});

test("checkout cannot substitute a sibling variation when the requested variation is missing", async () => {
  const result = await revalidateNovaCheckoutStock(
    client({ product: product({ variations: [{ ...PASSING_VARIANT, id: 2002 }] }) }),
    INPUT
  );

  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockReasons, ["variant-missing"]);
});

test("strict checkout stock requires supplier-managed stock", async () => {
  const result = await revalidateNovaCheckoutStock(
    client({ product: product({ variations: [{ ...PASSING_VARIANT, manage_stock: false }] }) }),
    INPUT
  );

  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockReasons, ["manage-stock-required"]);
});

test("strict checkout stock requires in_stock, instock status and a valid sufficient quantity", async () => {
  const result = await revalidateNovaCheckoutStock(
    client({
      product: product({
        variations: [{
          ...PASSING_VARIANT,
          in_stock: false,
          stock_status: "outofstock",
          stock_quantity: null
        }]
      })
    }),
    INPUT
  );

  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockReasons, [
    "not-in-stock",
    "stock-status-not-instock",
    "stock-quantity-missing-or-invalid"
  ]);
});

test("strict checkout stock blocks a quantity larger than the exact variation stock", async () => {
  const result = await revalidateNovaCheckoutStock(
    client({ product: product({ variations: [{ ...PASSING_VARIANT, stock_quantity: 1 }] }) }),
    INPUT
  );

  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockReasons, ["insufficient-stock"]);
  assert.equal(result.availableQuantity, 1);
});

test("a product without variations only accepts its own product id as the synthetic exact variant", async () => {
  const baseProduct = product({
    id: 100,
    variations: [],
    manage_stock: true,
    in_stock: true,
    stock_status: "instock",
    stock_quantity: 3,
    sale_price: "52.50",
    regular_price: "89.00"
  });

  const accepted = await revalidateNovaCheckoutStock(
    client({ product: baseProduct }),
    { ...INPUT, externalVariantId: "100" }
  );
  const rejected = await revalidateNovaCheckoutStock(
    client({ product: baseProduct }),
    INPUT
  );

  assert.equal(accepted.eligible, true);
  assert.equal(accepted.supplierCostMinor, 5_250);
  assert.equal(accepted.msrpMinor, 8_900);
  assert.deepEqual(rejected.blockReasons, ["variant-missing"]);
});

test("Nova sale price remains private supplier cost and regular price remains MSRP; no customer price is produced", async () => {
  const result = await revalidateNovaCheckoutStock(client(), INPUT);
  const shape = result as unknown as Record<string, unknown>;

  assert.equal(result.supplierCostMinor, 5_500);
  assert.equal(result.msrpMinor, 9_900);
  assert.equal("customerPriceMinor" in shape, false);
  assert.equal("retailPriceMinor" in shape, false);
});

test("missing supplier cost blocks checkout even when exact stock is available", async () => {
  const result = await revalidateNovaCheckoutStock(
    client({ product: product({ variations: [{ ...PASSING_VARIANT, sale_price: null }] , sale_price: null }) }),
    INPUT
  );

  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockReasons, ["supplier-cost-missing-or-invalid"]);
});

test("invalid requested quantity is rejected before any supplier call", async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => revalidateNovaCheckoutStock(client({ calls }), { ...INPUT, quantity: 0 }),
    /positive integer/
  );
  assert.deepEqual(calls, []);
});
