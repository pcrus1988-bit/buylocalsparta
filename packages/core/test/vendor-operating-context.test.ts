import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MANAGED_MARKET_ID,
  PLATFORM_GOVERNANCE_BOUNDARIES,
  assertVendorCapability,
  assertVendorResourceScope,
  buildVendorOperatingContext,
  buildVendorOperatingContextFromSession,
  hasVendorCapability
} from "../src/index.ts";

test("Sparta-compatible vendor context defaults to MANAGED without changing current scope", () => {
  const context = buildVendorOperatingContext({ vendorId: "vendor_sparta_1", roles: ["vendor_owner"] });
  assert.equal(context.vendorId, "vendor_sparta_1");
  assert.equal(context.marketId, DEFAULT_MANAGED_MARKET_ID);
  assert.equal(context.operatingModel, "MANAGED");
  assert.equal(hasVendorCapability(context, "inventory.manage"), true);
  assert.equal(hasVendorCapability(context, "orders.manage"), true);
  assert.equal(hasVendorCapability(context, "shop.manage"), false);
  assert.equal(hasVendorCapability(context, "catalogue.import"), false);
});

test("SELF_GOVERNED expansion vendor gains own-shop operations but never platform governance", () => {
  const context = buildVendorOperatingContext({
    vendorId: "vendor_kalamata_1",
    marketId: "kalamata",
    hubId: "hub_kalamata",
    locationId: "location_kalamata_center",
    operatingModel: "SELF_GOVERNED",
    roles: ["vendor_owner"]
  });

  for (const capability of [
    "shop.manage",
    "catalogue.import",
    "offer.manage",
    "pricing.manage",
    "inventory.manage",
    "orders.manage",
    "shipping.manage",
    "local_delivery.manage",
    "aade.manage",
    "customer_messages.manage",
    "promotions.manage",
    "seo.source_data.manage",
    "staff.manage"
  ] as const) assert.equal(hasVendorCapability(context, capability), true, capability);

  assert.equal(PLATFORM_GOVERNANCE_BOUNDARIES.includes("canonical.merge"), true);
  assert.equal(PLATFORM_GOVERNANCE_BOUNDARIES.includes("fair_exposure.manage"), true);
  assert.equal(PLATFORM_GOVERNANCE_BOUNDARIES.includes("seo.indexing.manage"), true);
  assert.equal(PLATFORM_GOVERNANCE_BOUNDARIES.includes("platform_finance.ledger.manage"), true);
});

test("SELF_GOVERNED can never inherit the managed Sparta fallback", () => {
  assert.throws(
    () => buildVendorOperatingContext({ vendorId: "vendor_expansion_1", operatingModel: "SELF_GOVERNED" }),
    /marketId is required/
  );
});

test("authenticated vendor session resolves the legacy managed Sparta context", () => {
  const context = buildVendorOperatingContextFromSession({
    vendorId: "vendor_sparta_1",
    roles: ["vendor_owner"]
  });
  assert.equal(context.marketId, DEFAULT_MANAGED_MARKET_ID);
  assert.equal(context.operatingModel, "MANAGED");
  assert.deepEqual(context.roles, ["vendor_owner"]);
});

test("authenticated expansion session requires explicit self-governed assignment", () => {
  const context = buildVendorOperatingContextFromSession(
    { vendorId: "vendor_tripoli_1", roles: ["vendor_manager"] },
    {
      marketId: "tripoli",
      hubId: "KM-HUB-TRIPOLI",
      locationId: "location_tripoli_center",
      operatingModel: "SELF_GOVERNED"
    }
  );
  assert.equal(context.marketId, "tripoli");
  assert.equal(context.hubId, "KM-HUB-TRIPOLI");
  assert.equal(context.locationId, "location_tripoli_center");
  assert.equal(context.operatingModel, "SELF_GOVERNED");
  assert.equal(hasVendorCapability(context, "pricing.manage"), true);
});

test("session context rejects missing vendor identity or non-vendor roles", () => {
  assert.throws(
    () => buildVendorOperatingContextFromSession({ roles: ["vendor_owner"] }),
    /principal.vendorId is required/
  );
  assert.throws(
    () => buildVendorOperatingContextFromSession({ vendorId: "vendor_1", roles: ["admin"] }),
    /Vendor staff role is required/
  );
});

test("capability assertion fails closed for a managed-only restriction", () => {
  const context = buildVendorOperatingContext({ vendorId: "vendor_sparta_1" });
  assert.throws(() => assertVendorCapability(context, "pricing.manage"), /Vendor capability denied/);
});

test("resource scope rejects cross-vendor and cross-market access", () => {
  const context = buildVendorOperatingContext({
    vendorId: "vendor_tripoli_1",
    marketId: "tripoli",
    hubId: "hub_tripoli",
    locationId: "location_tripoli_center",
    operatingModel: "SELF_GOVERNED"
  });

  assert.doesNotThrow(() => assertVendorResourceScope(context, {
    vendorId: "vendor_tripoli_1",
    marketId: "tripoli",
    hubId: "hub_tripoli",
    locationId: "location_tripoli_center"
  }));
  assert.throws(() => assertVendorResourceScope(context, { vendorId: "vendor_kalamata_1" }), /Vendor resource access denied/);
  assert.throws(() => assertVendorResourceScope(context, { vendorId: "vendor_tripoli_1", marketId: "sparta" }), /Vendor market access denied/);
  assert.throws(() => assertVendorResourceScope(context, { vendorId: "vendor_tripoli_1", hubId: "hub_kalamata" }), /Vendor hub access denied/);
  assert.throws(() => assertVendorResourceScope(context, { vendorId: "vendor_tripoli_1", locationId: "location_other" }), /Vendor location access denied/);
});

test("scope identifiers fail closed when blank", () => {
  assert.throws(() => buildVendorOperatingContext({ vendorId: "   " }), /vendorId is required/);
  assert.throws(() => buildVendorOperatingContext({ vendorId: "vendor_1", marketId: "  " }), /marketId is required/);
});