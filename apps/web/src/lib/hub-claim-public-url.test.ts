import assert from "node:assert/strict";
import { test } from "node:test";
import { hubClaimPublicPath } from "./hub-claim-public-url.ts";

test("CLAIM uses business slugs for canonical public URLs", () => {
  assert.equal(
    hubClaimPublicPath({ hubSlug: "volos", slug: "hostchefs" }),
    "/hubs/volos/business/hostchefs"
  );
  assert.equal(
    hubClaimPublicPath({ hubSlug: "volos", slug: "same-business-2" }),
    "/hubs/volos/business/same-business-2"
  );
});

test("internal prospect IDs and invalid segments cannot become public URLs", () => {
  assert.throws(() => hubClaimPublicPath({
    hubSlug: "volos", slug: "hubprospect_a1025e4f467e4313acc0bf4620bf4e41"
  }));
  assert.throws(() => hubClaimPublicPath({ hubSlug: "Volos", slug: "hostchefs" }));
  assert.throws(() => hubClaimPublicPath({ hubSlug: "volos", slug: "../hostchefs" }));
});
