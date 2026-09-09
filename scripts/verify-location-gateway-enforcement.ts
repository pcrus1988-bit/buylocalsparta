import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  LOCATION_GATEWAY_COOKIE,
  LOCATION_GATEWAY_PATH,
  SPARTA_GATEWAY_SLUG,
  isLocationGatewayRootEnforcementEnabled,
  shouldRedirectRootToLocationGateway
} from "../apps/web/src/lib/location-gateway-enforcement.ts";

assert.equal(LOCATION_GATEWAY_COOKIE, "km_locality");
assert.equal(LOCATION_GATEWAY_PATH, "/choose-location");
assert.equal(SPARTA_GATEWAY_SLUG, "sparti");

assert.equal(isLocationGatewayRootEnforcementEnabled(undefined), false);
assert.equal(isLocationGatewayRootEnforcementEnabled("false"), false);
assert.equal(isLocationGatewayRootEnforcementEnabled("TRUE"), true);
assert.equal(isLocationGatewayRootEnforcementEnabled(" true "), true);

assert.equal(
  shouldRedirectRootToLocationGateway({ pathname: "/", enforcementEnabled: false }),
  false,
  "the cutover must remain inert while the flag is disabled"
);
assert.equal(
  shouldRedirectRootToLocationGateway({ pathname: "/", enforcementEnabled: true }),
  true,
  "a first-time root visit must enter the location gateway when enabled"
);
assert.equal(
  shouldRedirectRootToLocationGateway({ pathname: "/", localitySlug: "sparti", enforcementEnabled: true }),
  false,
  "an explicit Sparta selection must be allowed through to the legacy storefront"
);
assert.equal(
  shouldRedirectRootToLocationGateway({ pathname: "/", localitySlug: "kalamata", enforcementEnabled: true }),
  true,
  "a non-Sparta selection must never fall through to the Sparta storefront"
);
assert.equal(
  shouldRedirectRootToLocationGateway({ pathname: "/", localitySlug: "not-a-real-hub", enforcementEnabled: true }),
  true,
  "a stale or invalid locality must return to the location gateway"
);

for (const pathname of [
  "/choose-location",
  "/shop",
  "/category/tools",
  "/product/example",
  "/join",
  "/vendor/login",
  "/admin",
  "/api/health/ready"
]) {
  assert.equal(
    shouldRedirectRootToLocationGateway({ pathname, enforcementEnabled: true }),
    false,
    `${pathname} must remain outside the root-only enforcement boundary`
  );
}

const proxySource = await readFile(new URL("../apps/web/src/proxy.ts", import.meta.url), "utf8");
assert.match(proxySource, /BLS_LOCATION_GATEWAY_ROOT_ENFORCEMENT_ENABLED/);
assert.match(proxySource, /locationGatewayRedirectResponse\(request\)/);
assert.match(proxySource, /NextResponse\.redirect\(new URL\(LOCATION_GATEWAY_PATH, request\.url\), 307\)/);

console.log("Location gateway root enforcement policy verified.");
