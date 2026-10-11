import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HUB_LOCALITY_COOKIE,
  PRIMARY_LOCATION_GATEWAY_PATH,
  isLiveLocalitySelection,
  isLegacySpartaLocality
} from "../../../apps/web/src/lib/primary-location-gateway.ts";
import { seoDocumentRobotsHeader, seoRequestIndexingDecision } from "../../../apps/web/src/lib/seo-request-indexing.ts";
import { seoVisibilityForPath } from "../../../apps/web/src/lib/seo-visibility-policy.ts";
import { INDEXABLE_STATIC_ROUTES, NON_INDEXABLE_PAGE_ROUTES } from "../../../apps/web/src/lib/site-navigation.ts";

test("location selection remains accessible as an explicit page, not an entry redirect", () => {
  assert.equal(HUB_LOCALITY_COOKIE, "km_locality");
  assert.equal(PRIMARY_LOCATION_GATEWAY_PATH, "/choose-location");
  const proxySource = readFileSync(new URL("../../../apps/web/src/proxy.ts", import.meta.url), "utf8");
  assert.doesNotMatch(proxySource, /primaryLocationGatewayResponse|shouldRedirectToPrimaryLocationGateway|BLS_PRIMARY_LOCATION_GATEWAY_ENABLED/);
  // Public / stays the homepage for visitors and crawlers alike.
  assert.match(proxySource, /if \(pathname === "\/"\) return false;/);
});

test("location cookie still records live hubs without forcing a homepage redirect", () => {
  assert.equal(isLiveLocalitySelection("sparti"), true);
  assert.equal(isLiveLocalitySelection("SPARTI"), true);
  assert.equal(isLiveLocalitySelection("sparta"), true);
  assert.equal(isLegacySpartaLocality("sparta"), true);
  assert.equal(isLiveLocalitySelection("kalamata"), false);
  assert.equal(isLiveLocalitySelection("%E0%A4%A"), false);
  assert.equal(isLiveLocalitySelection(undefined), false);
});

test("homepage and location selector are equally crawlable public documents", () => {
  for (const pathname of ["/", "/choose-location"]) {
    const decision = seoRequestIndexingDecision(pathname);
    assert.equal(decision.index, true, pathname);
    assert.equal(decision.follow, true, pathname);
    assert.equal(seoDocumentRobotsHeader(pathname, new URLSearchParams()), undefined, pathname);
    assert.equal(seoVisibilityForPath(pathname).sitemapEligible, true, pathname);
    assert.ok(INDEXABLE_STATIC_ROUTES.some((route) => route.href === pathname), pathname);
    assert.ok(!NON_INDEXABLE_PAGE_ROUTES.includes(pathname as (typeof NON_INDEXABLE_PAGE_ROUTES)[number]), pathname);
  }
  const pageSource = readFileSync(new URL("../../../apps/web/src/app/choose-location/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /governedStaticSeoMetadata\("\/choose-location"/);
  assert.match(pageSource, /canonicalPath: "\/choose-location"/);
  assert.doesNotMatch(pageSource, /index: false|follow: false|nosnippet: true/);
});
