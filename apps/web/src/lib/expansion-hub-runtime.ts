import { EXPANSION_HUBS } from "./expansion-hubs.ts";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type ExpansionHubLifecycleState = "inactive" | "prospect" | "active";
export type ExpansionHubResearchStatus = "IN_PROGRESS" | "ACTIVE_REFERENCE" | null;

export type ExpansionHubRuntimeState = Readonly<{
  hubId: string;
  lifecycleState: ExpansionHubLifecycleState;
  prospectCount: number;
  researchStatus: ExpansionHubResearchStatus;
  isLive: boolean;
  isSpartaLegacy: boolean;
}>;

export type ExpansionHubRuntimeSnapshot = Readonly<{
  hubs: readonly ExpansionHubRuntimeState[];
  source: "database" | "safe-fallback";
}>;

type RuntimeRow = Readonly<Record<string, unknown>>;
const MASTER_IDS = new Set(EXPANSION_HUBS.map((hub) => hub.id));

function safeFallbackSnapshot(): ExpansionHubRuntimeSnapshot {
  return {
    source: "safe-fallback",
    hubs: EXPANSION_HUBS.map((hub) => ({
      hubId: hub.id,
      lifecycleState: hub.isSpartaLegacy ? "active" : "inactive",
      prospectCount: 0,
      researchStatus: hub.isSpartaLegacy ? "ACTIVE_REFERENCE" : null,
      isLive: hub.isSpartaLegacy,
      isSpartaLegacy: hub.isSpartaLegacy
    }))
  };
}

function parseLifecycle(value: unknown, hubId: string): ExpansionHubLifecycleState {
  if (value === "inactive" || value === "prospect" || value === "active") return value;
  throw new Error(`Invalid lifecycle_state for ${hubId}`);
}

function parseResearchStatus(value: unknown, hubId: string): ExpansionHubResearchStatus {
  if (value === null || value === "IN_PROGRESS" || value === "ACTIVE_REFERENCE") return value;
  throw new Error(`Invalid research_status for ${hubId}`);
}

function parseRow(row: RuntimeRow): ExpansionHubRuntimeState {
  const hubId = String(row.hub_id ?? "");
  if (!MASTER_IDS.has(hubId)) throw new Error(`Runtime registry references unknown HUB ${hubId || "<empty>"}`);
  const lifecycleState = parseLifecycle(row.lifecycle_state, hubId);
  const prospectCount = Number(row.prospect_count ?? 0);
  if (!Number.isInteger(prospectCount) || prospectCount < 0) throw new Error(`Invalid prospect_count for ${hubId}`);
  const researchStatus = parseResearchStatus(row.research_status ?? null, hubId);
  const isLive = row.is_live === true;
  const isSpartaLegacy = row.is_sparta_legacy === true;

  if (isLive !== (lifecycleState === "active")) throw new Error(`Generated is_live mismatch for ${hubId}`);
  if (isSpartaLegacy !== (hubId === "KM-HUB-015")) throw new Error(`Generated is_sparta_legacy mismatch for ${hubId}`);

  return { hubId, lifecycleState, prospectCount, researchStatus, isLive, isSpartaLegacy };
}

function validateSnapshot(hubs: readonly ExpansionHubRuntimeState[]): void {
  if (hubs.length !== EXPANSION_HUBS.length) throw new Error(`Runtime HUB registry must contain 131 rows; found ${hubs.length}`);
  if (new Set(hubs.map((hub) => hub.hubId)).size !== hubs.length) throw new Error("Runtime HUB registry contains duplicate hub_id values");
  const sparta = hubs.find((hub) => hub.hubId === "KM-HUB-015");
  if (!sparta || !sparta.isLive || !sparta.isSpartaLegacy || sparta.lifecycleState !== "active") {
    throw new Error("Sparta KM-HUB-015 must remain the live legacy HUB");
  }
}

export async function getExpansionHubRuntimeSnapshot(): Promise<ExpansionHubRuntimeSnapshot> {
  if (!productionDatabaseConfigured()) return safeFallbackSnapshot();

  try {
    const result = await getProductionPostgresRuntime().sqlPool.query(`
      SELECT hub_id,
             lifecycle_state,
             prospect_count,
             research_status,
             is_live,
             is_sparta_legacy
      FROM public.expansion_hubs
      ORDER BY hub_id
    `);
    const hubs = result.rows.map((row) => parseRow(row));
    validateSnapshot(hubs);
    return { source: "database", hubs };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "expansion_hubs.runtime_read_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return safeFallbackSnapshot();
  }
}
