import { normalizeSearchText } from "@buy-local-sparta/core";
import { loadCatalogMetadata } from "./catalog-metadata";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const PROJECTION_TTL_MS = 15_000;
const globals = globalThis as typeof globalThis & {
  __blsPostgresStorefrontSearchProjection?: {
    expiresAt: number;
    promise: Promise<readonly SearchProjectionRow[]>;
  };
};

type SearchProjectionRow = Readonly<{
  id: string;
  title: string;
  titleKey: string;
  searchable: string;
}>;

export type PostgresStorefrontSearchSignal = Readonly<{
  provider: "postgres";
  hasResults: boolean;
  suggestions: readonly string[];
  visibleProducts: number;
}>;

export type PostgresStorefrontSearchReadiness = Readonly<{
  ready: boolean;
  provider: "postgres";
  mode: "authoritative_catalog";
  visibleProducts: number;
  message: string;
}>;

export async function postgresStorefrontSearchSignal(query: string, limit = 8): Promise<PostgresStorefrontSearchSignal> {
  const normalizedQuery = normalizeSearchText(query.slice(0, 120));
  if (!normalizedQuery || !productionDatabaseConfigured()) {
    return { provider: "postgres", hasResults: false, suggestions: [], visibleProducts: 0 };
  }

  const rows = await projection();
  const matched = rows
    .filter((row) => row.searchable.includes(normalizedQuery))
    .sort((left, right) => rank(left, normalizedQuery) - rank(right, normalizedQuery) || left.title.localeCompare(right.title, "el"));
  const suggestions: string[] = [];
  const seen = new Set<string>();
  for (const row of matched) {
    const key = normalizeSearchText(row.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    suggestions.push(row.title);
    if (suggestions.length >= clampLimit(limit)) break;
  }

  return {
    provider: "postgres",
    hasResults: matched.length > 0,
    suggestions,
    visibleProducts: rows.length
  };
}

export async function postgresStorefrontSearchReadiness(): Promise<PostgresStorefrontSearchReadiness> {
  if (!productionDatabaseConfigured()) {
    return { ready: false, provider: "postgres", mode: "authoritative_catalog", visibleProducts: 0, message: "PostgreSQL is not configured" };
  }
  try {
    const rows = await projection(true);
    return {
      ready: true,
      provider: "postgres",
      mode: "authoritative_catalog",
      visibleProducts: rows.length,
      message: "PostgreSQL authoritative storefront search projection is readable"
    };
  } catch (error) {
    return {
      ready: false,
      provider: "postgres",
      mode: "authoritative_catalog",
      visibleProducts: 0,
      message: error instanceof Error ? error.message.slice(0, 300) : "PostgreSQL storefront search readiness failed"
    };
  }
}

async function projection(forceRefresh = false): Promise<readonly SearchProjectionRow[]> {
  const now = Date.now();
  const current = globals.__blsPostgresStorefrontSearchProjection;
  if (!forceRefresh && current && current.expiresAt > now) return current.promise;

  const promise = loadProjection();
  globals.__blsPostgresStorefrontSearchProjection = { expiresAt: now + PROJECTION_TTL_MS, promise };
  try {
    return await promise;
  } catch (error) {
    if (globals.__blsPostgresStorefrontSearchProjection?.promise === promise) {
      delete globals.__blsPostgresStorefrontSearchProjection;
    }
    throw error;
  }
}

async function loadProjection(): Promise<readonly SearchProjectionRow[]> {
  const commerce = getProductionPostgresRuntime().customerCommerce;
  const canonicals = await commerce.publicCanonicals("sparta");
  const metadata = await loadCatalogMetadata(canonicals.map((product) => product.id));
  return canonicals.map((product) => {
    const details = metadata.get(product.id);
    const fields = [
      product.title,
      details?.description,
      details?.brand,
      details?.color,
      details?.mpn,
      details?.gtin,
      details?.categoryLabel,
      ...details?.sizes ?? []
    ];
    return {
      id: product.id,
      title: product.title,
      titleKey: normalizeSearchText(product.title),
      searchable: fields.map((value) => normalizeSearchText(value ?? "")).filter(Boolean).join(" ")
    };
  });
}

function rank(row: SearchProjectionRow, query: string): number {
  if (row.titleKey === query) return 0;
  if (row.titleKey.startsWith(query)) return 1;
  if (row.titleKey.includes(query)) return 2;
  return 3;
}

function clampLimit(value: number): number {
  if (!Number.isSafeInteger(value)) return 8;
  return Math.max(1, Math.min(20, value));
}
