export type BuildGuidanceScenarioRequest = Readonly<{
  scenarioKey: string;
  facts: Readonly<Record<string, unknown>>;
}>;

type PaintScenarioInput = Readonly<{ module: "paint"; surface: string; condition: string }>;
type WaterproofScenarioInput = Readonly<{ module: "waterproofing"; location: string; problem: string }>;
type InsulationScenarioInput = Readonly<{ module: "insulation"; location: string; goal: string }>;
type RepairScenarioInput = Readonly<{ module: "repair"; issue: string; severity: string }>;

export type BuildStudioScenarioInput = PaintScenarioInput | WaterproofScenarioInput | InsulationScenarioInput | RepairScenarioInput;

function request(scenarioKey: string, facts: Readonly<Record<string, unknown>> = {}): BuildGuidanceScenarioRequest {
  return { scenarioKey, facts };
}

/** Maps only combinations covered by reviewed, published research batches. */
export function mapBuildStudioScenario(input: BuildStudioScenarioInput): BuildGuidanceScenarioRequest | null {
  if (input.module === "paint") {
    if (input.surface === "interior-wall") {
      if (input.condition === "sound") return request("paint_interior_repaint_sound");
      if (input.condition === "stains") return request("paint_interior_stained");
      if (input.condition === "new-plaster") return request("paint_interior_new_plaster");
      if (input.condition === "new-gypsum") return request("paint_interior_new_gypsum_board");
      if (input.condition === "hairline-cracks") return request("repair_hairline_wall_crack");
      if (input.condition === "peeling") return request("paint_existing_peeling");
      if (input.condition === "damp") return request("paint_interior_mould_damp", { significant_moisture: true, source_known: false });
      return null;
    }
    if (input.surface === "exterior-wall") {
      if (input.condition === "sound") return request("paint_exterior_repaint_sound");
      if (input.condition === "new" || input.condition === "new-plaster") return request("paint_exterior_new_plaster");
      if (input.condition === "chalking") return request("paint_exterior_chalking");
      if (input.condition === "cracks") return request("paint_exterior_hairline_cracks");
      if (input.condition === "damp") return request("waterproof_exterior_wall_rain_penetration", { significant_moisture: true, source_known: false });
      return null;
    }
    if (input.surface === "wood") {
      if (input.condition === "bare") return request("paint_wood_bare");
      if (input.condition === "painted") return request("paint_wood_existing_sound", { existing_coating_known_compatible: false });
      if (input.condition === "weathered") return request("paint_wood_weathered");
    }
    if (input.surface === "metal") {
      const ferrousFacts = { metal_type_known: true, metal_type: "ferrous_steel" };
      if (input.condition === "bare") return request("paint_metal_bare_ferrous", ferrousFacts);
      if (input.condition === "painted") return request("paint_metal_existing_sound_ferrous", { ...ferrousFacts, existing_coating_known_compatible: false });
      if (input.condition === "rust") return request("paint_metal_rusty", ferrousFacts);
    }
    if (input.surface === "bathroom") {
      if (input.condition === "sound") return request("paint_bathroom_high_humidity", { significant_moisture: false });
      if (input.condition === "damp" || input.condition === "mould") return request("paint_bathroom_high_humidity", { significant_moisture: true, source_known: false });
    }
    if (input.surface === "roof") {
      if (input.condition === "maintenance") return request("waterproof_existing_system_maintenance", { existing_waterproofing_compatible: false });
      if (input.condition === "new") return request("waterproof_flat_roof");
      if (input.condition === "cracks") return request("waterproof_details_parapets_joints_penetrations", { cracks_or_joints_present: true, detail_movement: "unknown_or_significant" });
    }
    return null;
  }

  if (input.module === "waterproofing") {
    if (input.location === "roof") {
      if (input.problem === "standing-water") return request("waterproof_roof_standing_water", { standing_water: true, drainage_or_falls_assessed: false });
      if (input.problem === "maintenance") return request("waterproof_existing_system_maintenance", { existing_waterproofing_compatible: false });
      if (input.problem === "cracks") return request("waterproof_details_parapets_joints_penetrations", { cracks_or_joints_present: true, detail_movement: "unknown_or_significant" });
      return request("waterproof_flat_roof", input.problem === "leak" ? { active_water_ingress: true } : {});
    }
    if (input.location === "balcony") {
      if (input.problem === "leak") return request("waterproof_balcony_leak", { active_water_ingress: true });
      if (input.problem === "maintenance") return request("waterproof_existing_system_maintenance", { existing_waterproofing_compatible: false });
      if (input.problem === "cracks") return request("waterproof_details_parapets_joints_penetrations", { cracks_or_joints_present: true, detail_movement: "unknown_or_significant" });
      return null;
    }
    if (input.location === "exterior-wall") {
      if (input.problem === "standing-water") return null;
      return request("waterproof_exterior_wall_rain_penetration", {
        ...(input.problem === "leak" ? { active_water_ingress: true, significant_moisture: true, source_known: false } : {}),
        ...(input.problem === "cracks" ? { cracks_or_joints_present: true } : {}),
        ...(input.problem === "maintenance" ? { existing_coating_known_compatible: false } : {})
      });
    }
    if (input.location === "basement") {
      // The reviewed below-grade scenario is a moisture-ingress diagnostic path.
      // Do not reinterpret maintenance, cracks or generic standing water as the same
      // failure mechanism: those combinations need dedicated evidence/scenarios.
      if (input.problem === "leak") {
        return request("waterproof_basement_below_grade_moisture", {
          significant_moisture: true,
          source_known: false,
          active_water_ingress: true
        });
      }
      return null;
    }
    return null;
  }

  if (input.module === "insulation") {
    if (input.goal === "condensation") {
      return request("insulation_thermal_bridge_condensation", {
        condensation_present: true,
        thermal_bridge_suspected: true,
        significant_moisture: true,
        source_known: false,
        cause_confirmed: false
      });
    }
    if (input.location === "facade") return request("insulation_external_etics", { work_at_height: true, safe_access_confirmed: false });
    if (input.location === "interior-wall") return request("insulation_internal_condensation_risk");
    if (input.location === "roof") return request("insulation_roof_general", { roof_build_up_known: false, work_at_height: true, safe_access_confirmed: false });
    return null;
  }

  if (input.issue === "hairline") return request("repair_hairline_wall_crack");
  if (input.issue === "recurrent-crack") return request("repair_recurrent_or_large_wall_crack", { crack_progressive_or_displaced: true });
  if (input.issue === "holes") return request("repair_small_holes_dents", { repair_extent: input.severity === "extensive" ? "extensive" : "local" });
  if (input.issue === "peeling") return request("paint_existing_peeling");
  if (input.issue === "plaster") return request("repair_damaged_plaster", input.severity === "extensive" ? { detached_plaster: "widespread" } : {});
  if (input.issue === "friable") return request("repair_weak_friable_wall_surface", { friable_area: input.severity === "extensive" ? "widespread" : "local" });
  if (input.issue === "damp") return request("paint_interior_mould_damp", { significant_moisture: true, source_known: false });
  return null;
}
