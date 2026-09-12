import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { novaAutoPricingEnabled } from "../src/lib/nova-auto-pricing-runtime.ts";

test("NOVA automatic pricing is disabled unless explicitly opted in", () => {
  const previous = process.env.BLS_NOVA_AUTO_PRICING_ENABLED;
  try {
    delete process.env.BLS_NOVA_AUTO_PRICING_ENABLED;
    assert.equal(novaAutoPricingEnabled(), false);

    process.env.BLS_NOVA_AUTO_PRICING_ENABLED = "false";
    assert.equal(novaAutoPricingEnabled(), false);

    process.env.BLS_NOVA_AUTO_PRICING_ENABLED = "TRUE";
    assert.equal(novaAutoPricingEnabled(), true);

    process.env.BLS_NOVA_AUTO_PRICING_ENABLED = " true ";
    assert.equal(novaAutoPricingEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env.BLS_NOVA_AUTO_PRICING_ENABLED;
    else process.env.BLS_NOVA_AUTO_PRICING_ENABLED = previous;
  }
});

test("OVERPRICED is a diagnostic flag, never an MSRP execution ceiling", () => {
  const source = readFileSync(
    new URL("../src/lib/nova-auto-pricing-runtime.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /sellingPriceMinor:\s*recommendation\.recommendedSellingPriceMinor/[Symbol.match]
      ? /sellingPriceMinor:\s*recommendation\.recommendedSellingPriceMinor/
      : /sellingPriceMinor:\s*recommendation\.recommendedSellingPriceMinor/
  );
  assert.match(source, /pricingFlag:\s*recommendation\.overpriced\s*\?\s*"OVERPRICED"\s*:\s*null/);
  assert.doesNotMatch(
    source,
    /if\s*\(recommendation\.overpriced\)\s*\{[\s\S]{0,800}?sellingPriceMinor:\s*null/
  );
});
