import { EXPANSION_HUBS } from "./expansion-hubs.ts";
import { SPARTA_GATEWAY_SLUG, SPARTA_MARKET_CODE } from "./hub-resolver.ts";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type ExpansionHubLifecycleState = "inactive" | "prospect" | "active";
export type ExpansionHubDisplayState = "inactive" | "prospect" | "active";
export type ExpansionHubResearchStatus = "IN_PROGRESS" | "ACTIVE_REFERENCE" | null;

export type ExpansionHubRuntimeState = Readonly<{
  hubId: string;
  /** Gateway-safe effective state. `active` always means customer-enterable. */
  lifecycleState: ExpansionHubDisplayState;
  /** Raw mutable registry lifecycle from public.expansion_hubs. */
  registryLifecycleState: ExpansionHubLifecycleState;
  displayState: ExpansionHubDisplayState;
  prospectCount: number;
  researchStatus: ExpansionHubResearchStatus;
  /** Compatibility alias consumed by the gateway client; equivalent to enterable. */
  isLive: boolean;
  registryIsLive: boolean;
  isSpartaLegacy: boolean;
  marketId?: string;
  marketCode?: string;
  gatewaySlug?: string;
  isOperational: boolean;
  gatewayVisible: boolean;
  shoppingEnabled: boolean;
  searchIndexable: boolean;
  isDefaultFallback: boolean;
  enterable: boolean;
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
    hubs: EXPANSION_HUBS.map((hub) => {
      const isSparta = hub.isSpartaLegacy;
      const state: ExpansionHubDisplayState = isSparta ? "active" : "inactive";
      return {
        hubId: hub.id,
        lifecycleState: state,
        registryLifecycleState: state,
        displayState: state,
        prospectCount: 0,
        researchStatus: isSparta ? "ACTIVE_REFERENCE" : null,
        isLive: isSparta,
        registryIsLive: isSparta,
        isSpartaLegacy: isSparta,
        marketCode: isSparta ? SPARTA_MARKET_CODE : undefined,
        gatewaySlug: isSparta ? SPARTA_GATEWAY_SLUG : undefined,
        isOperational: isSparta,
        gatewayVisible: isSparta,
        shoppingEnabled: isSparta,
        searchIndexable: isSparta,
        isDefaultFallback: isSparta,
        enterable: isSparta
      } satisfies ExpansionHubRuntimeState;
    })
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

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseRow(row: RuntimeRow): ExpansionHubRuntimeState {
  const hubId = String(row.hub_id ?? "");
  if (!MASTER_IDS.has(hubId)) throw new Error(`Runtime registry references unknown HUB ${hubId || "<empty>"}`);

  const registryLifecycleState = parseLifecycle(row.lifecycle_state, hubId);
  const prospectCount = Number(row.prospect_count ?? 0);
  if (!Number.isInteger(prospectCount) || prospectCount < 0) throw new Error(`Invalid prospect_count for ${hubId}`);

  const researchStatus = parseResearchStatus(row.research_status ?? null, hubId);
  const registryIsLive = row.is_live === true;
  const isSpartaLegacy = row.is_sparta_legacy === true;
  const marketId = optionalString(row.market_id);
  const marketCode = optionalString(row.market_code);
  const gatewaySlug = optionalString(row.gateway_slug);
  const isOperational = row.is_operational === true;
  const gatewayVisible = row.gateway_visible === true;
  const shoppingEnabled = row.shopping_enabled === true;
  const searchIndexable = row.search_indexable === true;
  const isDefaultFallback = row.is_default_fallback === true;

  if (registryIsLive !== (registryLifecycleState === "active")) throw new Error(`Generated is_live mismatch for ${hubId}`);
  if (isSpartaLegacy !== (hubId === "KM-HUB-015")) throw new Error(`Generated is_sparta_legacy mismatch for ${hubId}`);

  const enterable = registryIsLive
    && Boolean(marketId)
    && Boolean(marketCode)
    && isOperational
    && gatewayVisible
    && shoppingEnabled;
  const displayState: ExpansionHubDisplayState = enterable
    ? "active"
    : registryLifecycleState === "prospect"
      ? "prospect"
      : "inactive";

  return {
    hubId,
    lifecycleState: displayState,
    registryLifecycleState,
    displayState,
    prospectCount,
    researchStatus,
    isLive: enterable,
    registryIsLive,
    isSpartaLegacy,
    marketId,
    marketCode,
    gatewaySlug,
    isOperational,
    gatewayVisible,
    shoppingEnabled,
    searchIndexable,
    isDefaultFallback,
    enterable
  };
}

function validateSnapshot(hubs: readonly ExpansionHubRuntimeState[]): void {
  if (hubs.length !== EXPANSION_HUBS.length) throw new Error(`Runtime HUB registry must contain 131 rows; found ${hubs.length}`);
  if (new Set(hubs.map((hub) => hub.hubId)).size !== hubs.length) throw new Error("Runtime HUB registry contains duplicate hub_id values");

  const activeWithoutOperationalBinding = hubs.filter((hub) => hub.registryLifecycleState === "active" && !hub.enterable);
  if (activeWithoutOperationalBinding.length) {
    throw new Error(`Active HUBs require an operational market binding: ${activeWithoutOperationalBinding.map((hub) => hub.hubId).join(", ")}`);
  }

  const defaultFallbacks = hubs.filter((hub) => hub.isDefaultFallback);
  if (defaultFallbacks.length !== 1) throw new Error(`Runtime HUB registry must have exactly one default market fallback; found ${defaultFallbacks.length}`);

  const sparta = hubs.find((hub) => hub.hubId === "KM-HUB-015");
  if (
    !sparta
    || !sparta.registryIsLive
    || !sparta.isSpartaLegacy
    || sparta.registryLifecycleState !== "active"
    || sparta.lifecycleState !== "active"
    || !sparta.enterable
    || sparta.marketCode !== SPARTA_MARKET_CODE
    || sparta.gatewaySlug !== SPARTA_GATEWAY_SLUG
    || !sparta.isDefaultFallback
  ) {
    throw new Error("Sparta KM-HUB-015 must remain the enterable default legacy market");
  }
}

export async function getExpansionHubRuntimeSnapshot(): Promise<ExpansionHubRuntimeSnapshot> {
  if (!productionDatabaseConfigured()) return safeFallbackSnapshot();

  try {
    const result = await getProductionPostgresRuntime().sqlPool.query(`
      SELECT h.hub_id,
             h.lifecycle_state,
             h.prospect_count,
             h.research_status,
             h.is_live,
             h.is_sparta_legacy,
             c.market_id,
             m.code AS market_code,
             c.gateway_slug,
             c.is_operational,
             c.gateway_visible,
             c.shopping_enabled,
             c.search_indexable,
             c.is_default_fallback
      FROM public.expansion_hubs AS h
      LEFT JOIN public.market_hub_config AS c
        ON c.hub_code = h.hub_id
      LEFT JOIN public.markets AS m
        ON m.id = c.market_id
      ORDER BY h.hub_id
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
