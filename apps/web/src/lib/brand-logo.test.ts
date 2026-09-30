import assert from "node:assert/strict";
import test from "node:test";
import { publicBrandLogoUrl } from "./brand-logo.ts";

test("canonical bucket keys become public Storage URLs with escaped path segments", () => {
  assert.equal(publicBrandLogoUrl("brands/givenchy/logo.svg"), "https://eemihhfreggbigxejjhj.supabase.co/storage/v1/object/public/brands/brands/givenchy/logo.svg");
});

test("verified official HTTPS assets are used only when the canonical object is absent", () => {
  assert.equal(
    publicBrandLogoUrl(undefined, "https://brand.example/assets/logo.svg"),
    "https://brand.example/assets/logo.svg"
  );
  assert.equal(
    publicBrandLogoUrl("brands/givenchy/logo.svg", "https://brand.example/fallback.png"),
    "https://eemihhfreggbigxejjhj.supabase.co/storage/v1/object/public/brands/brands/givenchy/logo.svg"
  );
});

test("unsafe object keys and external URLs never create an image URL", () => {
  for (const key of [null, "", "../evil.svg", "https://example.org/logo.png", "brands/logo.gif", "brands/../../secret.png"]) {
    assert.equal(publicBrandLogoUrl(key), undefined);
  }
  for (const url of ["http://brand.example/logo.svg", "https://localhost/logo.svg", "https://user:pass@brand.example/logo.svg", "not-a-url"]) {
    assert.equal(publicBrandLogoUrl(undefined, url), undefined);
  }
});
