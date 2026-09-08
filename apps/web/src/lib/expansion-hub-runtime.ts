import "server-only";

import { createPostgresRuntimeFromEnv } from "@buy-local-sparta/postgres-runtime";
import {
  EXPANSION_HUBS,
  assertExpansionHubMaster,
  type ExpansionHub
} from "./expansion-hubs";
import {
  EXPANSION_HUB_STATUS_RECORDS,
  assertExpansionHubStatusAlignment,
  type ExpansionHubDisplayState,
  type ExpansionHubRuntimeView,
  type ExpansionHubStatusRecord
} from "./expansion-hub-status";

export type ExpansionHubRuntimeSnapshot = Readonly<{
  hubs: readonly ExpansionHub[];
  statuses: readonly ExpansionHubStatusRecord[];
  source: "database" | "fallback";
}>;

type ExpansionHubOperationalRow = {
  hub_id: string;
  lifecycle_state: string;
  prospect_count: number;
  research_status: string | null;
  is_live: boolean;
  is_sparta_legacy: boolean;
};

const DISPLAY_STATES = new Set<ExpansionHubDisplayState>(["inactive", "prospect", "active"]);

function fallbackSnapshot(): ExpansionHubRuntimeSnapshot {
  assertExpansionHubMaster();
  assertExpansionHubStatusAlignment();
  return {
    hubs: EXPANSION_HUBS,
    statuses: EXPANSION_HUB_STATUS_RECORDS,
    source: "fallback"
  };
}

function toStatus(row: ExpansionHubOperationalRow, hub: ExpansionHub): ExpansionHubStatusRecord {
  const state = row.lifecycle_state as ExpansionHubDisplayState;
  if (!DISPLAY_STATES.has(state)) throw new Error(`Unknown lifecycle state for ${row.hub_id}`);
  const researchStatus = row.research_status === "IN_PROGRESS" || row.research_status === "ACTIVE_REFERENCE"
    ? row.research_status
    : undefined;
  if (row.research_status && !researchStatus) throw new Error(`Unknown research status for ${row.hub_id}`);
  return {
    id: row.hub_id,
    slug: hub.slug,
    state,
    prospectCount: Number(row.prospect_count) > 0 ? Number(row.prospect_count) : undefined,
    researchStatus
  };
}

function validateDatabaseSnapshot(
  hubs: readonly ExpansionHub[],
  statuses: readonly ExpansionHubStatusRecord[],
  rows: readonly ExpansionHubOperationalRow[]
): void {
  if (rows.length !== 131 || hubs.length !== 131 || statuses.length !== 131) {
    throw new Error(`Expansion hub registry must contain exactly 131 hubs; found ${rows.length}`);
  }
  const ids = new Set(rows.map((row) => row.hub_id));
  if (ids.size !== 131) throw new Error("Expansion hub registry contains duplicate hub IDs");

  for (let index = 1; index <= 131; index += 1) {
    const expectedId = `KM-HUB-${String(index).padStart(3, "0")}`;
    if (!ids.has(expectedId)) throw new Error(`Expansion hub registry is missing ${expectedId}`);
  }

  const sparta = hubs.find((hub) => hub.id === "KM-HUB-015");
  const spartaStatus = statuses.find((status) => status.id === "KM-HUB-015");
  const spartaRow = rows.find((row) => row.hub_id === "KM-HUB-015");
  if (!sparta || sparta.slug !== "sparti" || !sparta.isSpartaLegacy || !sparta.isLive || sparta.futureSeoPath !== "/") {
    throw new Error("Database registry must preserve Sparta as the live legacy hub KM-HUB-015");
  }
  if (!spartaStatus || spartaStatus.state !== "active" || !spartaRow?.is_sparta_legacy) {
    throw new Error("Sparta must remain the active legacy hub status");
  }

  for (const [index, hub] of hubs.entries()) {
    const status = statuses[index];
    const row = rows[index];
    if (!status || status.id !== hub.id || status.slug !== hub.slug || !row || row.hub_id !== hub.id) {
      throw new Error(`Missing or mismatched runtime registry row for ${hub.id}`);
    }
    if (hub.isLive !== (status.state === "active") || hub.isLive !== row.is_live) {
      throw new Error(`Live/status mismatch for ${hub.id}`);
    }
    if (row.is_sparta_legacy !== hub.isSpartaLegacy) {
      throw new Error(`Legacy-hub mismatch for ${hub.id}`);
    }
  }
}

export async function getExpansionHubRuntimeSnapshot(): Promise<ExpansionHubRuntimeSnapshot> {
  const fallback = fallbackSnapshot();

  // Deliberately opt-in while the 131-hub foundation is being rolled out.
  // A migration or preview deployment cannot change customer behaviour merely by existing.
  if (process.env.BLS_EXPANSION_HUB_REGISTRY_ENABLED !== "true") return fallback;

  let runtime: ReturnType<typeof createPostgresRuntimeFromEnv> | undefined;
  try {
    runtime = createPostgresRuntimeFromEnv({ applicationName: "konta-mou:web:expansion-hubs" });
    const result = await runtime.sqlPool.query<ExpansionHubOperationalRow>(`
      SELECT hub_id, lifecycle_state, prospect_count, research_status,
             is_live, is_sparta_legacy
        FROM public.expansion_hubs
       ORDER BY hub_id ASC
    `);
    const rows = [...result.rows];
    if (rows.length !== 131) throw new Error(`Expansion hub registry must contain 131 rows; found ${rows.length}`);

    const rowById = new Map(rows.map((row) => [row.hub_id, row] as const));
    const baseHubs = EXPANSION_HUBS.map((hub) => {
      const row = rowById.get(hub.id);
      if (!row) throw new Error(`Expansion hub registry is missing ${hub.id}`);
      return { ...hub, isLive: row.is_live };
    });
    const statuses = baseHubs.map((hub) => {
      const row = rowById.get(hub.id);
      if (!row) throw new Error(`Expansion hub registry is missing status for ${hub.id}`);
      return toStatus(row, hub);
    });
    const statusById = new Map(statuses.map((status) => [status.id, status] as const));
    const hubs: readonly ExpansionHubRuntimeView[] = baseHubs.map((hub) => {
      const status = statusById.get(hub.id);
      if (!status) throw new Error(`Expansion hub registry is missing runtime state for ${hub.id}`);
      return {
        ...hub,
        runtimeDisplayState: status.state,
        runtimeProspectCount: status.prospectCount
      };
    });

    // Validate in master order, not database collation order.
    const orderedRows = hubs.map((hub) => rowById.get(hub.id) as ExpansionHubOperationalRow);
    validateDatabaseSnapshot(hubs, statuses, orderedRows);
    return { hubs, statuses, source: "database" };
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "expansion_hub_registry.fallback",
      message: error instanceof Error ? error.message : String(error)
    }));
    return fallback;
  } finally {
    await runtime?.close().catch(() => undefined);
  }
}
