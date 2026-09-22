import assert from "node:assert/strict";
import test from "node:test";
import { mapBuildStudioScenario } from "./build-guidance-scenario-map.ts";

test("maps reviewed interior paint scenarios without merging distinct substrates or failures", () => {
  assert.deepEqual(mapBuildStudioScenario({ module: "paint", surface: "interior-wall", condition: "sound" }), { scenarioKey: "paint_interior_repaint_sound", facts: {} });
  assert.deepEqual(mapBuildStudioScenario({ module: "paint", surface: "interior-wall", condition: "new-plaster" }), { scenarioKey: "paint_interior_new_plaster", facts: {} });
  assert.deepEqual(mapBuildStudioScenario({ module: "paint", surface: "interior-wall", condition: "new-gypsum" }), { scenarioKey: "paint_interior_new_gypsum_board", facts: {} });
  assert.deepEqual(mapBuildStudioScenario({ module: "paint", surface: "interior-wall", condition: "hairline-cracks" }), { scenarioKey: "repair_hairline_wall_crack", facts: {} });
  assert.deepEqual(mapBuildStudioScenario({ module: "paint", surface: "interior-wall", condition: "peeling" }), { scenarioKey: "paint_existing_peeling", facts: {} });
  assert.equal(mapBuildStudioScenario({ module: "paint", surface: "interior-wall", condition: "new" }), null);
  assert.equal(mapBuildStudioScenario({ module: "paint", surface: "interior-wall", condition: "cracks" }), null);
});

test("maps reviewed exterior new plaster without borrowing interior guidance", () => {
  assert.deepEqual(
    mapBuildStudioScenario({ module: "paint", surface: "exterior-wall", condition: "new-plaster" }),
    { scenarioKey: "paint_exterior_new_plaster", facts: {} }
  );
});

test("unresolved moisture maps to diagnosis-first blocking facts", () => {
  assert.deepEqual(mapBuildStudioScenario({ module: "paint", surface: "bathroom", condition: "mould" }), { scenarioKey: "paint_bathroom_high_humidity", facts: { significant_moisture: true, source_known: false } });
});

test("roof standing water requires drainage and falls assessment", () => {
  assert.deepEqual(mapBuildStudioScenario({ module: "waterproofing", location: "roof", problem: "standing-water" }), { scenarioKey: "waterproof_roof_standing_water", facts: { standing_water: true, drainage_or_falls_assessed: false } });
});

test("active balcony leak is mapped as active water ingress", () => {
  assert.deepEqual(mapBuildStudioScenario({ module: "waterproofing", location: "balcony", problem: "leak" }), { scenarioKey: "waterproof_balcony_leak", facts: { active_water_ingress: true } });
});

test("ETICS remains blocked until safe access is confirmed", () => {
  assert.deepEqual(mapBuildStudioScenario({ module: "insulation", location: "facade", goal: "both" }), { scenarioKey: "insulation_external_etics", facts: { work_at_height: true, safe_access_confirmed: false } });
});

test("second-batch below-grade moisture stays diagnosis-first", () => {
  assert.deepEqual(mapBuildStudioScenario({ module: "waterproofing", location: "basement", problem: "leak" }), { scenarioKey: "waterproof_basement_below_grade_moisture", facts: { significant_moisture: true, source_known: false, active_water_ingress: true } });
});

test("second-batch roof insulation stays blocked until build-up and access are known", () => {
  assert.deepEqual(mapBuildStudioScenario({ module: "insulation", location: "roof", goal: "both" }), { scenarioKey: "insulation_roof_general", facts: { roof_build_up_known: false, work_at_height: true, safe_access_confirmed: false } });
});

test("verified small-hole repair maps to its dedicated scenario", () => {
  assert.deepEqual(mapBuildStudioScenario({ module: "repair", issue: "holes", severity: "local" }), { scenarioKey: "repair_small_holes_dents", facts: { repair_extent: "local" } });
});

test("ambiguous new interior substrate remains fail-closed instead of guessing plaster vs gypsum board", () => {
  assert.equal(mapBuildStudioScenario({ module: "paint", surface: "interior-wall", condition: "new" }), null);
});

test("maps reviewed waterproofing maintenance and detail scenarios", () => {
  assert.deepEqual(mapBuildStudioScenario({ module: "waterproofing", location: "roof", problem: "maintenance" }), { scenarioKey: "waterproof_existing_system_maintenance", facts: { existing_coating_known_compatible: false } });
  assert.deepEqual(mapBuildStudioScenario({ module: "waterproofing", location: "balcony", problem: "cracks" }), { scenarioKey: "waterproof_details_parapets_joints_penetrations", facts: { cracks_or_joints_present: true } });
});

test("bathroom sound condition and condensation goal use reviewed dedicated guidance", () => {
  assert.deepEqual(mapBuildStudioScenario({ module: "paint", surface: "bathroom", condition: "sound" }), { scenarioKey: "paint_bathroom_high_humidity", facts: { significant_moisture: false } });
  assert.deepEqual(mapBuildStudioScenario({ module: "insulation", location: "interior-wall", goal: "condensation" }), { scenarioKey: "insulation_thermal_bridge_condensation", facts: { condensation_present: true, cause_confirmed: false } });
});

test("advanced repair choices map to their reviewed dedicated guidance", () => {
  assert.deepEqual(mapBuildStudioScenario({ module: "repair", issue: "recurrent-crack", severity: "medium" }), { scenarioKey: "repair_recurrent_or_large_wall_crack", facts: { crack_progressive_or_displaced: true } });
  assert.deepEqual(mapBuildStudioScenario({ module: "repair", issue: "friable", severity: "local" }), { scenarioKey: "repair_weak_friable_wall_surface", facts: { friable_area: "local" } });
  assert.deepEqual(mapBuildStudioScenario({ module: "repair", issue: "friable", severity: "extensive" }), { scenarioKey: "repair_weak_friable_wall_surface", facts: { friable_area: "widespread" } });
});
