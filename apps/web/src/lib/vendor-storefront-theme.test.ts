import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_VENDOR_PRIMARY_COLOR,
  DEFAULT_VENDOR_SECONDARY_COLOR,
  normalizeVendorBrandColor,
  readableTextColor,
  vendorStorefrontThemeTokens
} from "./vendor-storefront-theme.ts";

test("brand colors normalize safely and preserve valid vendor colors", () => {
  assert.equal(normalizeVendorBrandColor("#Ab12Ef", DEFAULT_VENDOR_PRIMARY_COLOR), "#ab12ef");
  assert.equal(normalizeVendorBrandColor("red", DEFAULT_VENDOR_PRIMARY_COLOR), DEFAULT_VENDOR_PRIMARY_COLOR);
});

test("theme tokens select readable foreground colors for light and dark backgrounds", () => {
  assert.equal(readableTextColor("#111111"), "#ffffff");
  assert.equal(readableTextColor("#f7e44c"), "#111111");
});

test("theme tokens include both vendor colors and translucent surfaces", () => {
  const tokens = vendorStorefrontThemeTokens({ primaryColor: "#123456", secondaryColor: "#fedcba" });
  assert.equal(tokens.primaryColor, "#123456");
  assert.equal(tokens.secondaryColor, "#fedcba");
  assert.match(tokens.primarySoft, /^rgba\(18,52,86,/);
  assert.match(tokens.secondarySoft, /^rgba\(254,220,186,/);
});

test("invalid colors fall back independently", () => {
  const tokens = vendorStorefrontThemeTokens({ primaryColor: "bad", secondaryColor: "" });
  assert.equal(tokens.primaryColor, DEFAULT_VENDOR_PRIMARY_COLOR);
  assert.equal(tokens.secondaryColor, DEFAULT_VENDOR_SECONDARY_COLOR);
});
