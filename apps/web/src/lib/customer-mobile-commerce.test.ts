import assert from "node:assert/strict";
import { test } from "node:test";
import { isCustomerMobileCommercePath } from "./customer-mobile-commerce.ts";

test("research pages never render the floating mobile shopping menu", () => {
  for (const pathname of [
    "/research",
    "/research/",
    "/research/compare",
    "/research/privacy",
    "/research/greek-retail-2026",
    "/research/greek-retail-2026/methodology",
    "/research/greek-retail-2026/t/example-token",
    "/research/simulation/example-token",
    "/RESEARCH/Compare/"
  ]) {
    assert.equal(isCustomerMobileCommercePath(pathname), false, pathname);
  }
});

test("unrelated marketplace pages retain the mobile shopping menu", () => {
  for (const pathname of ["/", "/shop", "/product/example", "/category/shoes", "/researching"]) {
    assert.equal(isCustomerMobileCommercePath(pathname), true, pathname);
  }
});

test("existing private sections remain excluded from the mobile shopping menu", () => {
  for (const pathname of ["/admin", "/admin/research", "/vendor/catalog", "/driver", "/delivery/manage", "/choose-location"]) {
    assert.equal(isCustomerMobileCommercePath(pathname), false, pathname);
  }
});
