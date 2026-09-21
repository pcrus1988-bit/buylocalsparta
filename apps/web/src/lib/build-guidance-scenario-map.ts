export type BuildGuidanceScenarioRequest = Readonly<{
  scenarioKey: string;
  facts: Readonly<Record<string, unknown>>;
}>;

type PaintScenarioInput = Readonly<{
  module: "paint";
  surface: string;
  condition: string;
}>;

type WaterproofScenarioInput = Readonly<{
  module: "waterproofing";
  location: string;
  problem: string;
}>;

type InsulationScenarioInput = Readonly<{
  module: "insulation";
  location: string;
  goal: string;
}>;

type RepairScenarioInput = Readonly<{
  module: "repair";
  issue: string;
  severity: string;
}>;

export type BuildStudioScenarioInput =
  | PaintScenarioInput
  | WaterproofScenarioInput
  | InsulationScenarioInput
  | RepairScenarioInput;

function request(scenarioKey: string, facts: Readonly<Record<string, unknown>> = {}): BuildGuidanceScenarioRequest {
  return { scenarioKey, facts };
}

/**
 * Maps only combinations covered by the reviewed first research batch.
 *
 * Returning null is intentional: the caller must show "guidance not yet verified"
 * rather than silently reusing the nearest technical scenario.
 */
export function mapBuildStudioScenario(input: BuildStudioScenarioInput): BuildGuidanceScenarioRequest | null {
  if (input.module === "paint") {
    if (input.surface === "interior-wall") {
      if (input.condition === "sound") return request("paint_interior_repaint_sound");
      if (input.condition === "stains") return request("paint_interior_stained");
      if (input.condition === "damp") {
        return request("paint_interior_mould_damp", {
          significant_moisture: true,
          source_known: false
        });
      }
      // Current "new" UI choice also includes plasterboard, while the reviewed
      // first-batch record is specifically newly plastered wall. Do not over-map.
      // Current "cracks" choice also combines cracking and peeling.
      return null;
    }

    if (input.surface === "exterior-wall") {
      if (input.condition === "sound") return request("paint_exterior_repaint_sound");
      if (input.condition === "chalking") return request("paint_exterior_chalking");
      if (input.condition === "cracks") return request("paint_exterior_hairline_cracks");
      return null;
    }

    if (input.surface === "wood" && input.condition === "bare") return request("paint_wood_bare");
    if (input.surface === "metal" && input.condition === "rust") return request("paint_metal_rusty");

    if (input.surface === "bathroom" && (input.condition === "damp" || input.condition === "mould")) {
      return request("paint_interior_mould_damp", {
        significant_moisture: true,
        source_known: false
      });
    }

    return null;
  }

  if (input.module === "waterproofing") {
    if (input.location === "roof") {
      if (input.problem === "standing-water") {
        return request("waterproof_roof_standing_water", {
          standing_water: true,
          drainage_or_falls_assessed: false
        });
      }
      return request("waterproof_flat_roof", input.problem === "leak" ? { active_water_ingress: true } : {});
    }

    if (input.location === "balcony" && input.problem === "leak") {
      return request("waterproof_balcony_leak", { active_water_ingress: true });
    }

    return null;
  }

  if (input.module === "insulation") {
    if (input.location === "facade") {
      return request("insulation_external_etics", {
        work_at_height: true,
        safe_access_confirmed: false
      });
    }
    if (input.location === "interior-wall") {
      return request("insulation_internal_condensation_risk");
    }
    return null;
  }

  if (input.issue === "hairline") return request("repair_hairline_wall_crack");
  if (input.issue === "plaster") {
    return request(
      "repair_damaged_plaster",
      input.severity === "extensive" ? { detached_plaster: "widespread" } : {}
    );
  }
  if (input.issue === "damp") {
    return request("paint_interior_mould_damp", {
      significant_moisture: true,
      source_known: false
    });
  }
  return null;
}
