import assert from "node:assert/strict";
import test from "node:test";
import { publicBrandLogoUrl } from "./brand-logo.ts";

test("canonical bucket keys become public Storage URLs with escaped path segments", () => {
  assert.equal(publicBrandLogoUrl("brands/givenchy/logo.svg"), "https://eemihhfreggbigxejjhj.supabase.co/storage/v1/object/public/brands/brands/givenchy/logo.svg");
});

test("missing and unsafe object keys never create a broken or external image URL", () => {
  for (const key of [null, "", "../evil.svg", "https://example.org/logo.png", "brands/logo.gif", "brands/../../secret.png"]) {
    assert.equal(publicBrandLogoUrl(key), undefined);
  }
});
