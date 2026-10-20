import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { hospitalityPrivatePath, hospitalityRewritePath, isHospitalityHost, isHospitalityHostPathAllowed } from "../src/lib/hospitality-routing.ts";
test("only exact hospitality hostname activates the gateway", () => {
  assert.equal(isHospitalityHost("hospitality.kontamou.site"), true);
  assert.equal(isHospitalityHost("evilhospitality.kontamou.site"), false);
  assert.equal(isHospitalityHost("kontamou.site"), false);
});
test("host barrier denies unrelated marketplace and admin routes", () => {
  for (const path of ["/account", "/admin", "/vendor", "/api/account/login", "/api/privacy/consent/receipt", "/api/privacy/report", "/cookies", "/privacy", "/privacy-controls", "/checkout", "/hospitality"]) {
    assert.equal(isHospitalityHostPathAllowed(path), false, path);
  }
  for (const path of ["/", "/drinkstock", "/drinkstock/login", "/drinkstock/dashboard", "/drinkStock", "/drinkStock/login", "/drinkStock/dashboard", "/api/privacy/consent", "/api/hospitality/login", "/api/hospitality/partners/111/venues/222/market", "/_next/static/a.js", "/brand/kontamou-sparta-logo.webp"]) {
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


test("DrinkStock uses one isolated visual system on every nested route", () => {
  const source = (relativePath: string) =>
    readFileSync(new URL("../src/app/hospitality/" + relativePath, import.meta.url), "utf8");
  const layout = source("drinkStock/layout.tsx");
  const tokens = source("drinkStock/design-system.css");
  const gateway = source("hospitality.module.css");
  const market = source("drinkStock/market.module.css");
  const tv = source("drinkStock/live/[token]/page.tsx");
  const table = source("drinkStock/table/[token]/page.tsx");

  assert.match(layout, /data-drinkstock-design/, "all nested routes share the product shell");
  assert.match(layout, /design-system\.css/, "product tokens are loaded from nested layout");
  assert.match(tokens, /--ds-bg:\s*#0d0a1e/, "canonical party-market background");
  assert.match(tokens, /--ds-lime:\s*#caff4e/, "canonical neon-lime CTA");
  assert.match(tokens, /--ds-pink:\s*#ff50a6/, "canonical down-price accent");
  assert.match(gateway, /\.shell:has\(\[data-drinkstock-design\]\)/,
    "only DrinkStock hides the broader Hospitality gateway chrome");
  assert.match(gateway, /:global\(\[data-drinkstock-design\]\) \.partnerCard/,
    "legacy partner pages are themed without changing the gateway");
  assert.match(market, /Product-level visual alignment/, "trading floor inherits the exchange language");
  assert.match(tv, /data-drinkstock-standalone/, "TV screen keeps fullscreen presentation");
  assert.match(table, /data-drinkstock-standalone/, "table QR keeps its mobile presentation");
  assert.match(tokens, /prefers-reduced-motion/, "motion preference remains supported");
});
