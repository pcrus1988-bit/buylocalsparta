import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeVendorExternalWebsiteSettings,
  normalizeVendorExternalWebsiteUrl,
  publicVendorExternalWebsiteUrl
} from "./vendor-external-website.ts";

test("CLAIM embedding is disabled by default and stores a URL while off", () => {
  assert.deepEqual(normalizeVendorExternalWebsiteSettings(undefined), { enabled: false, url: "" });
  assert.deepEqual(normalizeVendorExternalWebsiteSettings({ enabled: false, url: "https://example.gr/" }), {
    enabled: false, url: "https://example.gr/"
  });
  assert.equal(publicVendorExternalWebsiteUrl({ enabled: false, url: "https://example.gr" }), undefined);
});

test("only explicit validated opt-in publishes the HTTPS website", () => {
  assert.equal(normalizeVendorExternalWebsiteUrl("https://shop.example.gr/catalogue#top"), "https://shop.example.gr/catalogue");
  assert.equal(publicVendorExternalWebsiteUrl({ enabled: true, url: "https://shop.example.gr/shop" }), "https://shop.example.gr/shop");
  assert.throws(() => normalizeVendorExternalWebsiteSettings({ enabled: true, url: "" }));
});

test("reject unsafe URL schemes, credentials, local addresses and marketplace origins", () => {
  for (const candidate of [
    "http://example.gr", "javascript:alert(1)", "data:text/html,hello",
    "https://user:password@example.gr", "https://localhost", "https://example.local",
    "https://example.internal", "https://localhost.test", "https://127.0.0.1",
    "https://192.168.0.2", "https://[::1]", "https://kontamou.site",
    "https://claim.kontamou.site", "https://kontamou.gr",
    "https://example.gr:8443", "https://example.gr/\nwrong"
  ]) {
    assert.throws(() => normalizeVendorExternalWebsiteUrl(candidate), candidate);
    assert.equal(publicVendorExternalWebsiteUrl({ enabled: true, url: candidate }), undefined);
  }
});
