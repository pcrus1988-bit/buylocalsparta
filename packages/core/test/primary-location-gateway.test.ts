import assert from "node:assert/strict";
import test from "node:test";
import {
  HUB_LOCALITY_COOKIE,
  PRIMARY_LOCATION_GATEWAY_PATH,
  isLegacySpartaLocality,
  shouldRedirectToPrimaryLocationGateway
} from "../../../apps/web/src/lib/primary-location-gateway.ts";
import { isReadOnlyPublicCrawlerUserAgent } from "../../../apps/web/src/lib/public-crawler.ts";

test("primary location gateway constants remain stable", () => {
  assert.equal(HUB_LOCALITY_COOKIE, "km_locality");
  assert.equal(PRIMARY_LOCATION_GATEWAY_PATH, "/choose-location");
});

test("Sparta locality aliases retain the legacy root storefront", () => {
  assert.equal(isLegacySpartaLocality("sparti"), true);
  assert.equal(isLegacySpartaLocality("SPARTI"), true);
  assert.equal(isLegacySpartaLocality("sparta"), true);
  assert.equal(isLegacySpartaLocality("kalamata"), false);
  assert.equal(isLegacySpartaLocality("%E0%A4%A"), false);
  assert.equal(isLegacySpartaLocality(undefined), false);
});

test("bare human root requires a locality selection", () => {
  const base = { pathname: "/", method: "GET", userAgent: "Mozilla/5.0" } as const;
  assert.equal(shouldRedirectToPrimaryLocationGateway(base), true);
  assert.equal(shouldRedirectToPrimaryLocationGateway({ ...base, localityCookie: "kalamata" }), true);
  assert.equal(shouldRedirectToPrimaryLocationGateway({ ...base, localityCookie: "sparti" }), false);
  assert.equal(shouldRedirectToPrimaryLocationGateway({ ...base, localityCookie: "sparta" }), false);
});

test("direct routes and non-navigation methods are never location-gated", () => {
  assert.equal(shouldRedirectToPrimaryLocationGateway({ pathname: "/shop", method: "GET", userAgent: "Mozilla/5.0" }), false);
  assert.equal(shouldRedirectToPrimaryLocationGateway({ pathname: "/admin", method: "GET", userAgent: "Mozilla/5.0" }), false);
  assert.equal(shouldRedirectToPrimaryLocationGateway({ pathname: "/", method: "POST", userAgent: "Mozilla/5.0" }), false);
});

test("public crawlers and KONTA MOY SEO monitor retain the Sparta SEO root", () => {
  for (const userAgent of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "bingbot/2.0",
    "facebookexternalhit/1.1",
    "KONTA-MOU-SEO-Monitor/1.0 (+https://kontamou.site)"
  ]) {
    assert.equal(isReadOnlyPublicCrawlerUserAgent(userAgent), true, userAgent);
    assert.equal(shouldRedirectToPrimaryLocationGateway({ pathname: "/", method: "GET", userAgent }), false, userAgent);
  }
});
