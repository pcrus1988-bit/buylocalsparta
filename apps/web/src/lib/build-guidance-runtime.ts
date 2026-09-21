import { getProductionPostgresRuntime } from "./postgres-runtime";

export type BuildGuidanceSourceLayer = "GENERAL_GUIDANCE" | "MANUFACTURER_VITEX" | "MANUFACTURER" | "KONTA_MOU_RULE";

export type BuildProjectGuidance = Readonly<{
  status: "ready" | "blocked" | "review_required" | "guidance_partial" | "scenario_not_found";
  scenario_key: string;
  source_layers?: readonly BuildGuidanceSourceLayer[];
  guidance_conflict: boolean;
  blocked: boolean;
  effective_facts?: Readonly<Record<string, unknown>>;
  general_guidance: unknown;
  manufacturer_guidance: unknown;
  konta_mou_rules: unknown;
  precedence?: Readonly<Record<string, boolean>>;
}>;

export type ResolveBuildProjectGuidanceInput = Readonly<{
  scenarioKey: string;
  facts?: Readonly<Record<string, unknown>>;
  manufacturerProductId?: string | null;
  guidanceConflict?: boolean;
}>;

const scenarioKeyPattern = /^[a-z0-9_]{1,96}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateBuildGuidanceInput(input: ResolveBuildProjectGuidanceInput): ResolveBuildProjectGuidanceInput {
  const scenarioKey = input.scenarioKey.trim();
  if (!scenarioKeyPattern.test(scenarioKey)) throw new Error("Invalid Build Studio scenario key");

  const manufacturerProductId = input.manufacturerProductId?.trim() || null;
  if (manufacturerProductId && !uuidPattern.test(manufacturerProductId)) {
    throw new Error("Invalid manufacturer product id");
  }

  const facts = input.facts ?? {};
  if (!facts || Array.isArray(facts) || typeof facts !== "object") throw new Error("Build Studio facts must be an object");
  const serializedFacts = JSON.stringify(facts);
  if (serializedFacts.length > 12_000) throw new Error("Build Studio facts are too large");

  return {
    scenarioKey,
    facts,
    manufacturerProductId,
    guidanceConflict: input.guidanceConflict === true
  };
}

export async function resolveBuildProjectGuidance(input: ResolveBuildProjectGuidanceInput): Promise<BuildProjectGuidance> {
  const validated = validateBuildGuidanceInput(input);
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.sqlPool.query<{ guidance: BuildProjectGuidance }>(
    `select public.resolve_build_project_guidance($1, $2::jsonb, $3::uuid, $4::boolean) as guidance`,
    [
      validated.scenarioKey,
      JSON.stringify(validated.facts ?? {}),
      validated.manufacturerProductId ?? null,
      validated.guidanceConflict === true
    ]
  );

  const guidance = result.rows[0]?.guidance;
  if (!guidance) throw new Error("Build Studio guidance resolver returned no result");
  return guidance;
}


export type BuildGuidanceUiItem = Readonly<{
  key: string;
  sourceLayer: BuildGuidanceSourceLayer;
  textEl: string;
  shortEl?: string;
  evidence: readonly unknown[];
  severity?: string;
  requirement?: string;
  quantityBasis?: string;
  customerCanReplace?: boolean;
}>;

export type BuildCustomerGuide = Readonly<{
  status: BuildProjectGuidance["status"];
  blocked: boolean;
  guidanceConflict: boolean;
  beforeYouStart: readonly BuildGuidanceUiItem[];
  preparation: readonly BuildGuidanceUiItem[];
  whatYouNeed: readonly BuildGuidanceUiItem[];
  stepByStep: readonly BuildGuidanceUiItem[];
  manufacturerInstructions: readonly BuildGuidanceUiItem[];
  timings: readonly BuildGuidanceUiItem[];
  avoid: readonly BuildGuidanceUiItem[];
  warnings: readonly BuildGuidanceUiItem[];
  quantity: Readonly<{
    status: "manufacturer_not_selected" | "manufacturer_data_missing" | "manufacturer_data_available";
    explanationEl: string;
  }>;
}>;

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringValues(value: unknown): readonly string[] {
  return asArray(value).map(textValue).filter((value): value is string => Boolean(value));
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function hasObjectValues(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length);
}

function wrapperParts(value: unknown) {
  const wrapper = asRecord(value);
  return { data: asRecord(wrapper.data), evidence: asArray(wrapper.evidence) };
}

function layerValue(value: unknown, fallback: BuildGuidanceSourceLayer): BuildGuidanceSourceLayer {
  return value === "GENERAL_GUIDANCE" || value === "MANUFACTURER_VITEX" || value === "MANUFACTURER" || value === "KONTA_MOU_RULE"
    ? value
    : fallback;
}

function manufacturerEvidenceFor(items: readonly unknown[], fieldNames: readonly string[]): readonly unknown[] {
  const names = new Set(fieldNames);
  return items.filter((item) => {
    const row = asRecord(item);
    return typeof row.field_name === "string" && names.has(row.field_name);
  });
}

function formatRange(min: number | undefined, max: number | undefined, suffix: string): string | undefined {
  if (min === undefined && max === undefined) return undefined;
  if (min !== undefined && max !== undefined && min !== max) return `${min}–${max}${suffix}`;
  return `${min ?? max}${suffix}`;
}

export function buildCustomerGuide(guidance: BuildProjectGuidance): BuildCustomerGuide {
  const general = asRecord(guidance.general_guidance);
  const rules = asArray(general.rules);
  const diagnostics = asArray(general.diagnostics);
  const steps = asArray(general.steps);
  const failures = asArray(general.failure_modes);
  const kits = asArray(general.project_kit_requirements);
  const manufacturer = asRecord(guidance.manufacturer_guidance);
  const manufacturerStatus = textValue(manufacturer.status) ?? "not_selected";
  const manufacturerLayer = layerValue(manufacturer.source_layer, "MANUFACTURER_VITEX");
  const manufacturerProfile = asRecord(manufacturer.application_profile);
  const instructionEvidence = asArray(manufacturer.instruction_evidence);
  const kontaMou = asRecord(guidance.konta_mou_rules);
  const stops = asArray(kontaMou.triggered_stop_conditions);

  const beforeYouStart: BuildGuidanceUiItem[] = diagnostics.map((entry, index) => {
    const { data, evidence } = wrapperParts(entry);
    return {
      key: textValue(data.diagnostic_key) ?? `diagnostic-${index + 1}`,
      sourceLayer: layerValue(data.source_layer, "GENERAL_GUIDANCE"),
      textEl: textValue(data.question_el) ?? "Απαιτείται έλεγχος της κατάστασης της επιφάνειας.",
      evidence
    };
  });

  for (const entry of rules) {
    const { data, evidence } = wrapperParts(entry);
    const category = textValue(data.rule_category);
    if (!["diagnosis", "substrate_readiness", "weather", "hygrothermal", "thermal_bridge"].includes(category ?? "")) continue;
    const textEl = textValue(data.customer_explanation_el) ?? textValue(data.short_explanation_el) ?? textValue(data.technical_rule);
    if (!textEl) continue;
    beforeYouStart.push({
      key: textValue(data.rule_key) ?? `precheck-${beforeYouStart.length + 1}`,
      sourceLayer: layerValue(data.source_layer, "GENERAL_GUIDANCE"),
      textEl,
      shortEl: textValue(data.short_explanation_el),
      evidence
    });
  }

  const preparation: BuildGuidanceUiItem[] = [];
  for (const entry of rules) {
    const { data, evidence } = wrapperParts(entry);
    if (!["surface_preparation", "primer_role", "drying"].includes(textValue(data.rule_category) ?? "")) continue;
    const textEl = textValue(data.customer_explanation_el) ?? textValue(data.short_explanation_el) ?? textValue(data.technical_rule);
    if (!textEl) continue;
    preparation.push({
      key: textValue(data.rule_key) ?? `preparation-${preparation.length + 1}`,
      sourceLayer: layerValue(data.source_layer, "GENERAL_GUIDANCE"),
      textEl,
      shortEl: textValue(data.short_explanation_el),
      evidence
    });
  }

  if (manufacturerStatus === "verified") {
    for (const [index, text] of stringValues(manufacturerProfile.surface_preparation).entries()) {
      preparation.push({
        key: `manufacturer-surface-preparation-${index + 1}`,
        sourceLayer: manufacturerLayer,
        textEl: text,
        evidence: manufacturerEvidenceFor(instructionEvidence, ["surface_preparation"])
      });
    }
    for (const [index, text] of stringValues(manufacturerProfile.cleaning_before_application).entries()) {
      preparation.push({
        key: `manufacturer-cleaning-${index + 1}`,
        sourceLayer: manufacturerLayer,
        textEl: text,
        evidence: manufacturerEvidenceFor(instructionEvidence, ["cleaning_before_application"])
      });
    }
    for (const [index, text] of stringValues(manufacturerProfile.repair_requirements).entries()) {
      preparation.push({
        key: `manufacturer-repair-${index + 1}`,
        sourceLayer: manufacturerLayer,
        textEl: text,
        evidence: manufacturerEvidenceFor(instructionEvidence, ["repair_requirements"])
      });
    }
  }

  const whatYouNeed: BuildGuidanceUiItem[] = kits.map((entry, index) => {
    const { data, evidence } = wrapperParts(entry);
    return {
      key: textValue(data.requirement_type) ?? `kit-${index + 1}`,
      sourceLayer: layerValue(data.source_layer, "GENERAL_GUIDANCE"),
      textEl: textValue(data.reason_el) ?? textValue(data.requirement_type) ?? "Απαίτηση έργου",
      evidence,
      requirement: textValue(data.requirement_level),
      quantityBasis: textValue(data.quantity_basis),
      customerCanReplace: typeof data.customer_can_replace === "boolean" ? data.customer_can_replace : undefined
    };
  });

  const stepByStep: BuildGuidanceUiItem[] = steps.map((entry, index) => {
    const { data, evidence } = wrapperParts(entry);
    return {
      key: `step-${String(data.step_number ?? index + 1)}`,
      sourceLayer: layerValue(data.source_layer, "GENERAL_GUIDANCE"),
      textEl: textValue(data.customer_explanation_el) ?? textValue(data.technical_rule) ?? "Βήμα έργου",
      evidence,
      requirement: data.required === true ? "required" : hasObjectValues(data.conditional_expression) ? "conditional" : undefined
    };
  });

  const manufacturerInstructions: BuildGuidanceUiItem[] = [];
  const addManufacturerInstruction = (key: string, textEl: string | undefined, fields: readonly string[]) => {
    if (!textEl) return;
    manufacturerInstructions.push({
      key,
      sourceLayer: manufacturerLayer,
      textEl,
      evidence: manufacturerEvidenceFor(instructionEvidence, fields)
    });
  };

  if (manufacturerStatus === "verified") {
    const dilution = formatRange(
      numberValue(manufacturerProfile.dilution_percent_min),
      numberValue(manufacturerProfile.dilution_percent_max),
      "%"
    );
    const dilutionMaterial = textValue(manufacturerProfile.dilution_material);
    if (manufacturerProfile.dilution_required === true) {
      addManufacturerInstruction(
        "manufacturer-dilution",
        dilution ? `Αραίωση: ${dilution}${dilutionMaterial ? ` με ${dilutionMaterial}` : ""}.` : "Απαιτείται αραίωση σύμφωνα με τις οδηγίες του κατασκευαστή.",
        ["dilution_required", "dilution_percent_min", "dilution_percent_max", "dilution_material"]
      );
    } else if (manufacturerProfile.dilution_required === false) {
      addManufacturerInstruction("manufacturer-dilution", "Δεν απαιτείται αραίωση.", ["dilution_required"]);
    }

    const coats = formatRange(
      numberValue(manufacturerProfile.number_of_coats_min),
      numberValue(manufacturerProfile.number_of_coats_max),
      " στρώσεις"
    );
    addManufacturerInstruction("manufacturer-coats", coats ? `Στρώσεις: ${coats}.` : undefined, ["number_of_coats_min", "number_of_coats_max"]);

    const methods = stringValues(manufacturerProfile.application_methods);
    addManufacturerInstruction(
      "manufacturer-application-methods",
      methods.length ? `Τρόπος εφαρμογής: ${methods.join(", ")}.` : undefined,
      ["application_methods"]
    );

    const moisture = textValue(manufacturerProfile.moisture_requirements);
    addManufacturerInstruction("manufacturer-moisture", moisture, ["moisture_requirements"]);

    for (const [index, note] of stringValues(manufacturerProfile.special_application_notes).entries()) {
      addManufacturerInstruction(`manufacturer-note-${index + 1}`, note, ["special_application_notes"]);
    }
  }

  const timings: BuildGuidanceUiItem[] = [];
  if (manufacturerStatus === "verified") {
    const timingDefinitions: readonly [string, string, string, string][] = [
      ["dry_to_touch", "Στέγνωμα στην αφή", "dry_to_touch_minutes_min", "dry_to_touch_minutes_max"],
      ["recoat", "Επαναβαφή", "recoat_minutes_min", "recoat_minutes_max"],
      ["full_cure", "Πλήρης ωρίμανση", "full_cure_minutes_min", "full_cure_minutes_max"]
    ];
    for (const [key, label, minField, maxField] of timingDefinitions) {
      const value = formatRange(numberValue(manufacturerProfile[minField]), numberValue(manufacturerProfile[maxField]), " λεπτά");
      if (!value) continue;
      timings.push({
        key: `manufacturer-${key}`,
        sourceLayer: manufacturerLayer,
        textEl: `${label}: ${value}.`,
        evidence: manufacturerEvidenceFor(instructionEvidence, [minField, maxField])
      });
    }
  }

  const avoid: BuildGuidanceUiItem[] = [];
  for (const entry of failures) {
    const { data, evidence } = wrapperParts(entry);
    for (const [index, action] of stringValues(data.preventive_actions).entries()) {
      avoid.push({
        key: `${textValue(data.failure_key) ?? "failure"}-prevention-${index + 1}`,
        sourceLayer: layerValue(data.source_layer, "GENERAL_GUIDANCE"),
        textEl: action,
        evidence,
        severity: textValue(data.severity)
      });
    }
  }
  if (manufacturerStatus === "verified") {
    for (const [index, text] of [
      ...stringValues(manufacturerProfile.manufacturer_do_not_do),
      ...stringValues(manufacturerProfile.weather_restrictions),
      ...stringValues(manufacturerProfile.not_suitable_for)
    ].entries()) {
      avoid.push({
        key: `manufacturer-avoid-${index + 1}`,
        sourceLayer: manufacturerLayer,
        textEl: text,
        evidence: manufacturerEvidenceFor(instructionEvidence, ["manufacturer_do_not_do", "weather_restrictions", "not_suitable_for"])
      });
    }
  }

  const warnings: BuildGuidanceUiItem[] = stops.map((entry, index) => {
    const stop = asRecord(entry);
    const reason = textValue(stop.reason_el) ?? "Το έργο χρειάζεται πρόσθετο έλεγχο πριν συνεχίσεις.";
    const next = textValue(stop.next_action_el);
    return {
      key: textValue(stop.stop_key) ?? `stop-${index + 1}`,
      sourceLayer: "KONTA_MOU_RULE",
      textEl: next ? `${reason} Επόμενο βήμα: ${next}` : reason,
      evidence: asArray(stop.evidence),
      severity: textValue(stop.severity)
    };
  });

  if (guidance.status === "guidance_partial") {
    warnings.push({
      key: "partial-evidence",
      sourceLayer: "KONTA_MOU_RULE",
      textEl: "Η διαθέσιμη τεχνική τεκμηρίωση για αυτό το σενάριο είναι ακόμη μερική. Μην θεωρήσεις την καθοδήγηση πλήρη επαγγελματική διάγνωση.",
      evidence: [],
      severity: "WARN"
    });
  }

  const quantity = manufacturerStatus === "verified" && manufacturer.quantity_inputs_available === true
    ? {
        status: "manufacturer_data_available" as const,
        explanationEl: "Η ποσότητα μπορεί να υπολογιστεί μόνο από τις επαληθευμένες τιμές κατανάλωσης/κάλυψης και στρώσεων του επιλεγμένου προϊόντος."
      }
    : manufacturerStatus === "not_selected"
      ? {
          status: "manufacturer_not_selected" as const,
          explanationEl: "Η ακριβής ποσότητα θα υπολογιστεί αφού επιλεγεί συγκεκριμένο προϊόν με επαληθευμένα στοιχεία κατασκευαστή."
        }
      : {
          status: "manufacturer_data_missing" as const,
          explanationEl: "Δεν υπάρχουν ακόμη επαληθευμένα στοιχεία κατασκευαστή για ασφαλή ακριβή υπολογισμό ποσότητας."
        };

  return {
    status: guidance.status,
    blocked: guidance.blocked,
    guidanceConflict: guidance.guidance_conflict,
    beforeYouStart,
    preparation,
    whatYouNeed,
    stepByStep,
    manufacturerInstructions,
    timings,
    avoid,
    warnings,
    quantity
  };
}
