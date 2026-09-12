import assert from "node:assert/strict";
import test from "node:test";
import {
  NOVA_EXPECTED_OWNER_VENDOR_PUBLIC_ID,
  novaRuntimeInvariantViolations
} from "../src/lib/nova-runtime-invariants.ts";

const safeState = Object.freeze({
  supplierFound: true,
  active: true,
  ownerVendorPublicId: NOVA_EXPECTED_OWNER_VENDOR_PUBLIC_ID,
  apiAuthoritativeAvailability: true,
  orderForwardingEnabled: false
});

test("accepts the production Nova supplier safety contract", () => {
  assert.deepEqual(novaRuntimeInvariantViolations(safeState), []);
});

test("fails closed when the Nova supplier is missing", () => {
  assert.deepEqual(novaRuntimeInvariantViolations({
    ...safeState,
    supplierFound: false,
    ownerVendorPublicId: null
  }), ["supplier_missing"]);
});

test("rejects ownership, availability authority, forwarding and active-state drift", () => {
  assert.deepEqual(novaRuntimeInvariantViolations({
    ...safeState,
    active: false,
    ownerVendorPublicId: "vendor_wrong",
    apiAuthoritativeAvailability: false,
    orderForwardingEnabled: true
  }), [
    "supplier_inactive",
    "owner_vendor_mismatch",
    "availability_not_api_authoritative",
    "supplier_order_forwarding_enabled"
  ]);
});
