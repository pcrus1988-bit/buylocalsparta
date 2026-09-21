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
      scenarioKey: "paint_bathroom_high_humidity",
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

test("second-batch below-grade moisture stays diagnosis-first", () => {
  assert.deepEqual(
    mapBuildStudioScenario({ module: "waterproofing", location: "basement", problem: "leak" }),
    {
      scenarioKey: "waterproof_basement_below_grade_moisture",
      facts: { significant_moisture: true, source_known: false, active_water_ingress: true }
    }
  );
});

test("second-batch roof insulation stays blocked until build-up and access are known", () => {
  assert.deepEqual(
    mapBuildStudioScenario({ module: "insulation", location: "roof", goal: "both" }),
    {
      scenarioKey: "insulation_roof_general",
      facts: { roof_build_up_known: false, work_at_height: true, safe_access_confirmed: false }
    }
  );
});

test("verified small-hole repair maps to its dedicated scenario", () => {
  assert.deepEqual(
    mapBuildStudioScenario({ module: "repair", issue: "holes", severity: "local" }),
    { scenarioKey: "repair_small_holes_dents", facts: { repair_extent: "local" } }
  );
});

test("ambiguous new interior substrate remains fail-closed instead of guessing plaster vs gypsum board", () => {
  assert.equal(
    mapBuildStudioScenario({ module: "paint", surface: "interior-wall", condition: "new" }),
    null
  );
});
