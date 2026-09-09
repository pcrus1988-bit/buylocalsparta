import test from "node:test";
import assert from "node:assert/strict";
import {
  getSupportedRootStorefrontHub,
  isLocationGatewayRootEnforcementEnabled,
  shouldRedirectRootToLocationGateway
} from "./location-gateway-enforcement.ts";

test("root gateway enforcement is off by default and accepts only explicit true values", () => {
  assert.equal(isLocationGatewayRootEnforcementEnabled(undefined), false);
  assert.equal(isLocationGatewayRootEnforcementEnabled(""), false);
  assert.equal(isLocationGatewayRootEnforcementEnabled("false"), false);
  assert.equal(isLocationGatewayRootEnforcementEnabled("0"), false);
  assert.equal(isLocationGatewayRootEnforcementEnabled("true"), true);
  assert.equal(isLocationGatewayRootEnforcementEnabled(" TRUE "), true);
  assert.equal(isLocationGatewayRootEnforcementEnabled("1"), true);
});

test("canonical Sparta selection unlocks the current root storefront", () => {
  const hub = getSupportedRootStorefrontHub("sparti");
  assert.equal(hub?.id, "KM-HUB-015");
  assert.equal(hub?.isSpartaLegacy, true);
  assert.equal(shouldRedirectRootToLocationGateway({ pathname: "/", localitySlug: "sparti", enforcementEnabled: true }), false);
});

test("missing, malformed and non-Sparta HUB selections cannot leak into Sparta root", () => {
  for (const localitySlug of [undefined, null, "", "not-a-hub", "%E0%A4%A", "kalamata", "athina"]) {
    assert.equal(
      shouldRedirectRootToLocationGateway({ pathname: "/", localitySlug, enforcementEnabled: true }),
      true,
      `expected ${String(localitySlug)} to be redirected to the location gateway`
    );
  }
});

test("disabled enforcement preserves the existing Sparta root for first-time visitors", () => {
  assert.equal(
    shouldRedirectRootToLocationGateway({ pathname: "/", localitySlug: undefined, enforcementEnabled: false }),
    false
  );
});

test("deep routes and unsafe methods are never intercepted by stage-one enforcement", () => {
  for (const pathname of ["/choose-location", "/shop", "/category/tools", "/product/123", "/join", "/admin", "/vendor/login", "/api/health"]) {
    assert.equal(
      shouldRedirectRootToLocationGateway({ pathname, localitySlug: undefined, enforcementEnabled: true }),
      false,
      `expected ${pathname} to remain untouched`
    );
  }

  assert.equal(
    shouldRedirectRootToLocationGateway({ pathname: "/", method: "POST", localitySlug: undefined, enforcementEnabled: true }),
    false
  );
});
