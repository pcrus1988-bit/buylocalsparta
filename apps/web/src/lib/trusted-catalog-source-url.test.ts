import assert from "node:assert/strict";
import test from "node:test";
import { trustedCatalogSourceHttpsUrl } from "./trusted-catalog-source-url.ts";

test("accepts an asset on the catalogue source host", () => {
  assert.equal(
    trustedCatalogSourceHttpsUrl(
      "nova-brandsgateway",
      "https://brandsgateway-img.s3.fr-par.scw.cloud/",
      "https://brandsgateway-img.s3.fr-par.scw.cloud/products/example.jpg"
    ),
    "https://brandsgateway-img.s3.fr-par.scw.cloud/products/example.jpg"
  );
});

test("accepts Symphonya's explicit CDN subdomain", () => {
  assert.equal(
    trustedCatalogSourceHttpsUrl(
      "symphonya",
      "https://www.symphonya.eu",
      "https://cdn.symphonya.eu/images/_products/example.jpg"
    ),
    "https://cdn.symphonya.eu/images/_products/example.jpg"
  );
});

test("rejects a foreign host and insecure supplier media", () => {
  assert.equal(
    trustedCatalogSourceHttpsUrl("symphonya", "https://www.symphonya.eu", "https://example.com/image.jpg"),
    undefined
  );
  assert.equal(
    trustedCatalogSourceHttpsUrl("symphonya", "https://www.symphonya.eu", "http://cdn.symphonya.eu/image.jpg"),
    undefined
  );
});

test("does not grant CDN subdomain access to unrelated catalogue sources", () => {
  assert.equal(
    trustedCatalogSourceHttpsUrl("other", "https://www.symphonya.eu", "https://cdn.symphonya.eu/image.jpg"),
    undefined
  );
});
