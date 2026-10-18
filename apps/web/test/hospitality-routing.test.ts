import assert from "node:assert/strict";
import test from "node:test";
import { hospitalityPrivatePath, hospitalityRewritePath, isHospitalityHost, isHospitalityHostPathAllowed } from "../src/lib/hospitality-routing.ts";
test("only exact hospitality hostname activates the gateway", () => {
  assert.equal(isHospitalityHost("hospitality.kontamou.site"), true);
  assert.equal(isHospitalityHost("evilhospitality.kontamou.site"), false);
  assert.equal(isHospitalityHost("kontamou.site"), false);
});
test("host barrier denies unrelated marketplace and admin routes", () => {
  for (const path of ["/account", "/admin", "/vendor", "/api/account/login", "/checkout", "/hospitality"]) {
    assert.equal(isHospitalityHostPathAllowed(path), false, path);
  }
  for (const path of ["/", "/drinkstock", "/drinkstock/login", "/drinkstock/dashboard", "/drinkStock", "/drinkStock/login", "/drinkStock/dashboard", "/api/hospitality/login", "/api/hospitality/partners/111/venues/222/market", "/_next/static/a.js", "/brand/kontamou-sparta-logo.webp"]) {
    assert.equal(isHospitalityHostPathAllowed(path), true, path);
  }
});
test("dashboard paths are private", () => {
  assert.equal(hospitalityPrivatePath("/drinkstock/dashboard"), true);
  assert.equal(hospitalityPrivatePath("/drinkstock/dashboard/a"), true);
  assert.equal(hospitalityPrivatePath("/drinkStock/dashboard"), true);
  assert.equal(hospitalityPrivatePath("/drinkStock/dashboard/a"), true);
  assert.equal(hospitalityPrivatePath("/drinkStock"), false);
  assert.equal(hospitalityPrivatePath("/drinkStock/login"), false);
});
test("hospitality root and DrinkStock route to isolated internal pages", () => {
  assert.equal(hospitalityRewritePath("/"), "/hospitality");
  assert.equal(hospitalityRewritePath("/drinkstock"), "/hospitality/drinkStock");
  assert.equal(hospitalityRewritePath("/drinkstock/login"), "/hospitality/drinkStock/login");
  assert.equal(hospitalityRewritePath("/drinkstock/dashboard/123"), "/hospitality/drinkStock/dashboard/123");
  assert.equal(hospitalityRewritePath("/drinkStock"), "/hospitality/drinkStock");
  assert.equal(hospitalityRewritePath("/drinkStock/login"), "/hospitality/drinkStock/login");
  assert.equal(hospitalityRewritePath("/drinkStock/dashboard/123"), "/hospitality/drinkStock/dashboard/123");
  for (const path of ["/shop", "/account", "/admin", "/vendor", "/hospitality", "/api/hospitality/login", "/_next/static/chunk.js"]) {
    assert.equal(hospitalityRewritePath(path), undefined, path);
  }
});
