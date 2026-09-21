import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerGuide, calculateBuildQuantity, validateBuildGuidanceInput, type BuildProjectGuidance } from "./build-guidance-runtime.ts";

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


function syntheticGuidance(overrides: Partial<BuildProjectGuidance> = {}): BuildProjectGuidance {
  return {
    status: "ready",
    scenario_key: "paint_interior_repaint_sound",
    guidance_conflict: false,
    blocked: false,
    general_guidance: {
      profile: {
        data: {
          inspection_after_application: ["Έλεγξε την ομοιομορφία μετά την ολοκλήρωση."],
          maintenance_guidance: ["Παρακολούθησε την επιφάνεια για νέα σημάδια αστοχίας."]
        },
        evidence: [{ source_key: "general-source" }]
      },
      diagnostics: [{
        data: {
          diagnostic_key: "surface_stable",
          source_layer: "GENERAL_GUIDANCE",
          question_el: "Η επιφάνεια είναι σταθερή;"
        },
        evidence: [{ source_key: "general-source" }]
      }],
      rules: [{
        data: {
          rule_key: "remove_loose_material",
          source_layer: "GENERAL_GUIDANCE",
          rule_category: "surface_preparation",
          customer_explanation_el: "Αφαίρεσε τα σαθρά σημεία."
        },
        evidence: [{ source_key: "general-source" }]
      }],
      steps: [{
        data: {
          step_number: 1,
          source_layer: "GENERAL_GUIDANCE",
          required: false,
          conditional_expression: { unstable_surface: true },
          customer_explanation_el: "Αφαίρεσε ό,τι δεν είναι σταθερό."
        },
        evidence: [{ source_key: "general-source" }]
      }],
      failure_modes: [{
        data: {
          failure_key: "peeling",
          source_layer: "GENERAL_GUIDANCE",
          preventive_actions: ["Μην βάψεις πάνω σε σαθρή επιφάνεια."],
          severity: "MEDIUM"
        },
        evidence: [{ source_key: "general-source" }]
      }],
      project_kit_requirements: [{
        data: {
          requirement_type: "main_coating",
          source_layer: "GENERAL_GUIDANCE",
          requirement_level: "required",
          reason_el: "Τελική βαφή.",
          quantity_basis: "manufacturer_declared_coverage",
          customer_can_replace: true
        },
        evidence: [{ source_key: "general-source" }]
      }]
    },
    manufacturer_guidance: {
      source_layer: "MANUFACTURER_VITEX",
      status: "not_selected",
      exact_product_values_available: false,
      quantity_inputs_available: false
    },
    konta_mou_rules: {
      source_layer: "KONTA_MOU_RULE",
      triggered_stop_conditions: [{
        stop_key: "active_water_ingress",
        source_layer: "KONTA_MOU_RULE",
        severity: "BLOCK",
        reason_el: "Υπάρχει ενεργή εισροή νερού.",
        next_action_el: "Έλεγχος της πηγής.",
        evidence: [{ source_key: "safety-source" }]
      }]
    },
    ...overrides
  };
}

test("customer guide preserves GENERAL_GUIDANCE and KONTA_MOU_RULE provenance", () => {
  const guide = buildCustomerGuide(syntheticGuidance({ status: "blocked", blocked: true }));

  assert.equal(guide.preparation[0]?.sourceLayer, "GENERAL_GUIDANCE");
  assert.equal(guide.stepByStep[0]?.sourceLayer, "GENERAL_GUIDANCE");
  assert.equal(guide.stepByStep[0]?.requirement, "conditional");
  assert.equal(guide.whatYouNeed[0]?.quantityBasis, "manufacturer_declared_coverage");
  assert.equal(guide.warnings[0]?.sourceLayer, "KONTA_MOU_RULE");
  assert.equal(guide.warnings[0]?.severity, "BLOCK");
  assert.equal(guide.manufacturerInstructions.length, 0);
  assert.equal(guide.timings.length, 0);
  assert.equal(guide.quantity.status, "manufacturer_not_selected");
});

test("verified Vitex instructions remain manufacturer-labelled and evidence-backed", () => {
  const guide = buildCustomerGuide(syntheticGuidance({
    manufacturer_guidance: {
      source_layer: "MANUFACTURER_VITEX",
      status: "verified",
      quantity_inputs_available: true,
      application_profile: {
        dilution_required: true,
        dilution_percent_min: 10,
        dilution_percent_max: 10,
        dilution_material: "νερό",
        number_of_coats_min: 2,
        number_of_coats_max: 2,
        application_methods: ["ρολό"],
        recoat_minutes_min: 240,
        recoat_minutes_max: 360,
        manufacturer_do_not_do: ["Μην εφαρμόζεται εκτός των δηλωμένων ορίων."]
      },
      instruction_evidence: [
        { field_name: "dilution_percent_min", source: { title: "Official TDS" } },
        { field_name: "number_of_coats_min", source: { title: "Official TDS" } },
        { field_name: "recoat_minutes_min", source: { title: "Official TDS" } }
      ]
    }
  }));

  assert.ok(guide.manufacturerInstructions.length >= 3);
  assert.ok(guide.manufacturerInstructions.every((item) => item.sourceLayer === "MANUFACTURER_VITEX"));
  assert.ok(guide.timings.every((item) => item.sourceLayer === "MANUFACTURER_VITEX"));
  assert.equal(guide.quantity.status, "manufacturer_data_available");
  assert.match(guide.manufacturerInstructions[0]?.textEl ?? "", /10%/);
});

test("partial evidence creates a KONTA MOU uncertainty warning", () => {
  const guide = buildCustomerGuide(syntheticGuidance({ status: "guidance_partial" }));
  const warning = guide.warnings.find((item) => item.key === "partial-evidence");
  assert.equal(warning?.sourceLayer, "KONTA_MOU_RULE");
  assert.equal(warning?.severity, "WARN");
});


test("maintenance and inspection remain general guidance with provenance", () => {
  const guide = buildCustomerGuide(syntheticGuidance());
  assert.equal(guide.afterApplication.length, 2);
  assert.ok(guide.afterApplication.every((item) => item.sourceLayer === "GENERAL_GUIDANCE"));
  assert.ok(guide.afterApplication.every((item) => item.evidence.length > 0));
});

test("quantity calculation fails closed unless all verified manufacturer inputs exist", () => {
  const missing = calculateBuildQuantity(syntheticGuidance({
    manufacturer_guidance: {
      source_layer: "MANUFACTURER_VITEX",
      status: "verified",
      quantity_inputs_available: true,
      application_profile: {
        coverage_m2_per_litre_min: 10,
        coverage_m2_per_litre_max: 12
      }
    }
  }), 24);
  assert.equal(missing.status, "missing_manufacturer_values");

  const available = calculateBuildQuantity(syntheticGuidance({
    manufacturer_guidance: {
      source_layer: "MANUFACTURER_VITEX",
      status: "verified",
      quantity_inputs_available: true,
      application_profile: {
        coverage_m2_per_litre_min: 10,
        coverage_m2_per_litre_max: 12,
        number_of_coats_min: 2,
        number_of_coats_max: 2
      }
    }
  }), 24);
  assert.equal(available.status, "available");
  assert.equal(available.min, 4);
  assert.equal(available.max, 4.8);
  assert.match(available.basisEl, /Δεν προστέθηκε αυθαίρετος/);
});

const traceabilityScenarios = [
  "paint_interior_repaint_sound",
  "paint_interior_mould_damp",
  "waterproof_balcony_leak",
  "insulation_external_etics",
  "repair_damaged_plaster"
] as const;

for (const scenarioKey of traceabilityScenarios) {
  test(`three-layer traceability fixture: ${scenarioKey}`, () => {
    const guide = buildCustomerGuide(syntheticGuidance({
      scenario_key: scenarioKey,
      manufacturer_guidance: {
        source_layer: "MANUFACTURER_VITEX",
        status: "verified",
        quantity_inputs_available: true,
        application_profile: {
          application_methods: ["ρολό"],
          number_of_coats_min: 2,
          number_of_coats_max: 2
        },
        instruction_evidence: [{ field_name: "application_methods", source: { title: "VITEX PDF" } }]
      }
    }));
    const layers = new Set([
      ...guide.beforeYouStart,
      ...guide.preparation,
      ...guide.stepByStep,
      ...guide.manufacturerInstructions,
      ...guide.warnings
    ].map((item) => item.sourceLayer));
    assert.ok(layers.has("GENERAL_GUIDANCE"));
    assert.ok(layers.has("MANUFACTURER_VITEX"));
    assert.ok(layers.has("KONTA_MOU_RULE"));
  });
}
