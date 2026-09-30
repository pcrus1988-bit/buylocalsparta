import { describe, expect, it } from "vitest";

import { mapBuildStudioScenario } from "@/lib/build-guidance-scenario-map";
import { PAINT_SURFACES } from "@/lib/paint-consultant";

describe("Paint & Build reviewed route contract", () => {
  it("maps every selectable paint surface into a reviewed scenario", () => {
    for (const surface of PAINT_SURFACES) {
      const mapped = mapBuildStudioScenario("paint", { surfaceId: surface.id });
      expect(mapped, `missing reviewed paint route for ${surface.id}`).not.toBeNull();
      expect(mapped?.scenario).toBeTruthy();
    }
  });

  it("keeps roof paint selectable and mapped to the reviewed exterior-paint scenario", () => {
    const roof = mapBuildStudioScenario("paint", { surfaceId: "roof" });
    expect(roof).not.toBeNull();
    expect(roof?.scenario).toBe("paint_exterior_recoat_masonry");
  });

  it("encodes safety-critical waterproofing facts using the resolver vocabulary", () => {
    expect(mapBuildStudioScenario("waterproofing", { waterproofArea: "roof", waterproofIssue: "maintenance" })?.facts).toMatchObject({
      existing_waterproofing_compatible: false,
    });
    expect(mapBuildStudioScenario("waterproofing", { waterproofArea: "roof", waterproofIssue: "cracks" })?.facts).toMatchObject({
      detail_movement: "unknown_or_significant",
    });
    expect(mapBuildStudioScenario("waterproofing", { waterproofArea: "balcony", waterproofIssue: "maintenance" })?.facts).toMatchObject({
      existing_waterproofing_compatible: false,
    });
    expect(mapBuildStudioScenario("waterproofing", { waterproofArea: "balcony", waterproofIssue: "cracks" })?.facts).toMatchObject({
      detail_movement: "unknown_or_significant",
    });
  });

  it("fails closed for unsupported basement issue combinations instead of guessing", () => {
    for (const issue of ["maintenance", "cracks", "standing-water"] as const) {
      expect(mapBuildStudioScenario("waterproofing", { waterproofArea: "basement", waterproofIssue: issue })).toBeNull();
    }
  });

  it("keeps insulation routes gated by safe-access and unknown-build-up facts", () => {
    expect(mapBuildStudioScenario("insulation", { insulationArea: "facade", insulationIssue: "thermal" })?.facts).toMatchObject({
      safe_access_confirmed: false,
    });
    expect(mapBuildStudioScenario("insulation", { insulationArea: "roof", insulationIssue: "thermal" })?.facts).toMatchObject({
      safe_access_confirmed: false,
      existing_roof_build_up_known: false,
    });
  });

  it("keeps recurrent repair routes fail-closed on movement uncertainty", () => {
    expect(mapBuildStudioScenario("repair", { repairIssue: "cracks", repairExtent: "recurrent" })?.facts).toMatchObject({
      crack_movement: "progressive_or_displaced",
    });
  });
});
