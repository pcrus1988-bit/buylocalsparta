import assert from "node:assert/strict";
import test from "node:test";
import type {
  DropshipAvailability,
  DropshipAvailabilityRequest,
  DropshipCreateOrderRequest,
  DropshipProviderOrder,
  DropshipSupplierAdapter
} from "../src/index.ts";
import { DropshipSupplierRegistry } from "../src/supplier-registry.ts";
import {
  dropshipSupplierIdempotencyKey,
  groupDropshipLinesBySupplier,
  requireSingleSupplierGroup
} from "../src/supplier-routing.ts";
import { createSymphonyaRuntime, envSymphonyaRuntime } from "../src/symphonya-runtime.ts";

const features = Object.freeze({
  catalogueSyncEnabled: true,
  apiAuthoritativeAvailability: true,
  orderForwardingEnabled: true,
  trackingSyncEnabled: true,
  returnsEnabled: false,
  shippingQuoteEnabled: false
});

class DummyAdapter implements DropshipSupplierAdapter {
  readonly providerKind: string;
  readonly capabilities = new Set(["availability", "create_order", "order_status", "tracking"] as const);

  constructor(providerKind: string) {
    this.providerKind = providerKind;
  }

  async readiness(): Promise<Readonly<{ ok: boolean; providerKind: string }>> {
    return { ok: true, providerKind: this.providerKind };
  }

  async getAvailability(_input: DropshipAvailabilityRequest): Promise<DropshipAvailability> {
    return { available: true, quantity: 1, checkedAt: Date.now(), raw: {} };
  }

  async createOrder(_input: DropshipCreateOrderRequest): Promise<DropshipProviderOrder> {
    return {
      externalOrderId: "1",
      providerStatus: "created",
      status: "supplier_confirmation",
      supplierPaymentRequired: false,
      raw: {}
    };
  }

  async getOrder(_externalOrderId: string): Promise<DropshipProviderOrder> {
    return {
      externalOrderId: "1",
      providerStatus: "processing",
      status: "preparing",
      supplierPaymentRequired: false,
      raw: {}
    };
  }
}

test("supplier registry keeps technical capabilities separate from production feature gates", () => {
  const registry = new DropshipSupplierRegistry()
    .register({
      code: "nova",
      displayName: "Nova / BrandsGateway",
      providerKind: "brandsgateway_shopwoo",
      active: true,
      adapter: new DummyAdapter("brandsgateway_shopwoo"),
      features
    })
    .register({
      code: "symphonya",
      displayName: "Symphonya",
      providerKind: "symphonya",
      active: true,
      adapter: new DummyAdapter("symphonya"),
      features: { ...features, orderForwardingEnabled: false }
    });

  assert.equal(registry.capabilityEnabled("nova", "create_order"), true);
  assert.equal(registry.capabilityEnabled("symphonya", "availability"), true);
  assert.equal(registry.capabilityEnabled("symphonya", "create_order"), false);
  assert.throws(() => registry.requireCapability("symphonya", "create_order"), /disabled by KONTA MOY configuration/);
  assert.deepEqual(registry.list().map((supplier) => supplier.code), ["nova", "symphonya"]);
});

test("mixed dropship lines are partitioned into supplier-isolated procurement groups", () => {
  const groups = groupDropshipLinesBySupplier([
    {
      supplierCode: "symphonya",
      orderLineId: "line-s1",
      externalProductId: "200",
      externalVariantId: "200",
      quantity: 2,
      supplierUnitCostMinor: 1200,
      currency: "EUR"
    },
    {
      supplierCode: "nova",
      orderLineId: "line-n1",
      externalProductId: "100",
      externalVariantId: "101",
      quantity: 1,
      supplierUnitCostMinor: 3000,
      currency: "eur"
    },
    {
      supplierCode: "symphonya",
      orderLineId: "line-s2",
      externalProductId: "201",
      externalVariantId: "201",
      quantity: 1,
      supplierUnitCostMinor: 500,
      currency: "EUR"
    }
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.supplierCode, "nova");
  assert.equal(groups[0]!.supplierSubtotalMinor, 3000);
  assert.equal(groups[1]!.supplierCode, "symphonya");
  assert.equal(groups[1]!.supplierSubtotalMinor, 2900);
  assert.throws(() => requireSingleSupplierGroup(groups.flatMap((group) => group.lines)), /Expected one dropship supplier/);
  assert.notEqual(
    dropshipSupplierIdempotencyKey("order-1", "nova"),
    dropshipSupplierIdempotencyKey("order-1", "symphonya")
  );
});

test("Symphonya runtime is fail-closed and does not require a secret while disabled", () => {
  assert.equal(createSymphonyaRuntime({ SYMPHONYA_ENABLED: "false" }), null);
  assert.throws(
    () => envSymphonyaRuntime({ SYMPHONYA_ENABLED: "true" }),
    /SYMPHONYA_API_KEY is required/
  );
  assert.throws(
    () => envSymphonyaRuntime({ SYMPHONYA_ENABLED: "false", SYMPHONYA_CARRIER: "invalid" }),
    /SYMPHONYA_CARRIER/
  );
});
