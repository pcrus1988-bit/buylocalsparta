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
