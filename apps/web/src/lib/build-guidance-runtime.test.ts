import assert from "node:assert/strict";
import test from "node:test";
import { validateBuildGuidanceInput } from "./build-guidance-runtime";

test("accepts conservative Build Studio guidance input", () => {
  assert.deepEqual(
    validateBuildGuidanceInput({
      scenarioKey: "paint_interior_repaint_sound",
      facts: { active_water_ingress: false },
      manufacturerProductId: null
    }),
    {
      scenarioKey: "paint_interior_repaint_sound",
      facts: { active_water_ingress: false },
      manufacturerProductId: null,
      guidanceConflict: false
    }
  );
});

test("rejects malformed scenario keys and manufacturer product ids", () => {
  assert.throws(() => validateBuildGuidanceInput({ scenarioKey: "../unsafe" }), /scenario key/i);
  assert.throws(
    () => validateBuildGuidanceInput({ scenarioKey: "paint_interior_repaint_sound", manufacturerProductId: "not-a-uuid" }),
    /product id/i
  );
});

test("rejects oversized diagnostic facts", () => {
  assert.throws(
    () => validateBuildGuidanceInput({
      scenarioKey: "paint_interior_repaint_sound",
      facts: { note: "x".repeat(12_500) }
    }),
    /too large/i
  );
});
