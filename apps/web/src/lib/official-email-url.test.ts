import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { KONTA_MOY_EMAIL_BASE_URL } from "./official-email-url.ts";

test("official KONTA MOY email links never use a secondary Vercel hostname", () => {
  assert.equal(KONTA_MOY_EMAIL_BASE_URL, "https://kontamou.site");
  const aliases = ["skroutz.site", "kontamou.info", "buylocalsparta-web.vercel.app"];
  for (const alias of aliases) {
    assert.notEqual(new URL(KONTA_MOY_EMAIL_BASE_URL).hostname, alias);
  }
  assert.equal(`${KONTA_MOY_EMAIL_BASE_URL}/admin/applications`,
    "https://kontamou.site/admin/applications");
  assert.equal(`${KONTA_MOY_EMAIL_BASE_URL}/vendor/login`,
    "https://kontamou.site/vendor/login");
});

test("vendor, HUB and agreement email templates use the authoritative domain", () => {
  for (const filename of [
    "vendor-email-workflows.ts",
    "vendor-activation-email.ts",
    "agreement-document-vault-email.ts"
  ]) {
    const source = readFileSync(new URL(`./${filename}`, import.meta.url), "utf8");
    assert.match(source, /KONTA_MOY_EMAIL_BASE_URL/, `${filename} must use the official domain`);
    assert.doesNotMatch(
      source,
      /BLS_PUBLIC_BASE_URL|NEXT_PUBLIC_SITE_URL|VERCEL_PROJECT_PRODUCTION_URL|VERCEL_URL/,
      `${filename} must not derive an email link from a deployment domain`
    );
  }
});
