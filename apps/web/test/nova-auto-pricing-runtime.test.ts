import assert from "node:assert/strict";
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
