import assert from "node:assert/strict";
import test from "node:test";
import { mapBuildStudioScenario } from "./build-guidance-scenario-map";

test("maps only reviewed paint scenarios", () => {
  assert.deepEqual(
    mapBuildStudioScenario({ module: "paint", surface: "interior-wall", condition: "sound" }),
    { scenarioKey: "paint_interior_repaint_sound", facts: {} }
  );
  assert.equal(
    mapBuildStudioScenario({ module: "paint", surface: "interior-wall", condition: "new" }),
    null
  );
  assert.equal(
    mapBuildStudioScenario({ module: "paint", surface: "interior-wall", condition: "cracks" }),
    null
  );
});

test("unresolved moisture maps to diagnosis-first blocking facts", () => {
  assert.deepEqual(
    mapBuildStudioScenario({ module: "paint", surface: "bathroom", condition: "mould" }),
    {
      scenarioKey: "paint_interior_mould_damp",
      facts: { significant_moisture: true, source_known: false }
    }
  );
});

test("roof standing water requires drainage and falls assessment", () => {
  assert.deepEqual(
    mapBuildStudioScenario({ module: "waterproofing", location: "roof", problem: "standing-water" }),
    {
      scenarioKey: "waterproof_roof_standing_water",
      facts: { standing_water: true, drainage_or_falls_assessed: false }
    }
  );
});

test("active balcony leak is mapped as active water ingress", () => {
  assert.deepEqual(
    mapBuildStudioScenario({ module: "waterproofing", location: "balcony", problem: "leak" }),
    {
      scenarioKey: "waterproof_balcony_leak",
      facts: { active_water_ingress: true }
    }
  );
});

test("ETICS remains blocked until safe access is confirmed", () => {
  assert.deepEqual(
    mapBuildStudioScenario({ module: "insulation", location: "facade", goal: "both" }),
    {
      scenarioKey: "insulation_external_etics",
      facts: { work_at_height: true, safe_access_confirmed: false }
    }
  );
});

test("unresearched combinations stay unmapped instead of borrowing a nearby scenario", () => {
  assert.equal(
    mapBuildStudioScenario({ module: "waterproofing", location: "basement", problem: "leak" }),
    null
  );
  assert.equal(
    mapBuildStudioScenario({ module: "insulation", location: "roof", goal: "both" }),
    null
  );
  assert.equal(
    mapBuildStudioScenario({ module: "repair", issue: "holes", severity: "local" }),
    null
  );
});
