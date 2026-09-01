import {
  OPEN_ICECAT_DETAIL_PROCESSING_VERSION,
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import * as memory from "./admin-governance-memory";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { getVendorOperationsRuntime } from "./vendor-operations-runtime";

type CatalogueSourceCategory = Readonly<{
  categoryCode: string;
  labelEl: string;
  parentCategoryCode?: string;
  active: boolean;
  directProducts: number;
  directLiveProducts: number;
}>;

export type CatalogueOverviewCategory = Readonly<{
  categoryCode: string;
  labelEl: string;
  parentCategoryCode?: string;
  depth: number;
  pathLabels: readonly string[];
  active: boolean;
  directProducts: number;
  directLiveProducts: number;
  subtreeProducts: number;
  subtreeLiveProducts: number;
  childCount: number;
}>;

export type OpenIcecatAdminHealth =
  | Readonly<{
      state: "not_configured" | "unavailable";
    }>
  | Readonly<{
      state: "available";
      processingVersion: string;
      activeIndexProducts: number;
      queueableProducts: number;
      missingGtin: number;
      missingGtinPct: number;
      detailProcessed: number;
      detailCoveragePct: number;
      readyCoveragePct: number;
      actionableBacklog: number;
      completedLastHour: number;
      oldestActionableAgeSeconds: number | null;
      queue: Readonly<{
        pending: number;
        processing: number;
        retry: number;
        ready: number;
        needsEnrichment: number;
        failed: number;
        skipped: number;
      }>;
    }>;

export type CatalogueOverviewWorkspace = Readonly<{
  csrfToken: string;
  categories: readonly CatalogueOverviewCategory[];
  metrics: Readonly<{
    totalCategories: number;
    activeCategories: number;
    rootCategories: number;
    leafCategories: number;
    emptyCategories: number;
    totalProducts: number;
    liveProducts: number;
    taxonomyLevels: number;
  }>;
  openIcecat: OpenIcecatAdminHealth;
}>;

function text(row: SqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== "string") throw new Error(`Database field ${field} is not a string`);
  return value;
}

function optionalText(row: SqlRow, field: string): string | undefined {
  const value = row[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function integer(row: SqlRow, field: string): number {
  const value = Number(row[field] ?? 0);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Database field ${field} is not a non-negative safe integer`);
  }
  return value;
}

function nullableInteger(row: SqlRow, field: string): number | null {
  if (row[field] === null || row[field] === undefined) return null;
  return integer(row, field);
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function booleanValue(row: SqlRow, field: string): boolean {
  return row[field] === true;
}

function compareCategories(a: CatalogueSourceCategory, b: CatalogueSourceCategory): number {
  return a.labelEl.localeCompare(b.labelEl, "el", { sensitivity: "base" })
    || a.categoryCode.localeCompare(b.categoryCode);
}

function normalizedParents(source: readonly CatalogueSourceCategory[]): Map<string, string | undefined> {
  const knownCodes = new Set(source.map((category) => category.categoryCode));
  const parents = new Map<string, string | undefined>();

  for (const category of source) {
    const parent = category.parentCategoryCode;
    parents.set(
      category.categoryCode,
      parent && parent !== category.categoryCode && knownCodes.has(parent) ? parent : undefined
    );
  }

  // Corrupt taxonomy data should never make the admin page recurse forever. Any node whose
  // ancestor chain enters a cycle is promoted to a root in this read model so the problem stays visible.
  for (const category of source) {
    const seen = new Set<string>();
    let cursor: string | undefined = category.categoryCode;
    let cyclic = false;
    while (cursor) {
      if (seen.has(cursor)) {
        cyclic = true;
        break;
      }
      seen.add(cursor);
      cursor = parents.get(cursor);
    }
    if (cyclic) parents.set(category.categoryCode, undefined);
  }

  return parents;
}

export function buildCatalogueOverview(
  csrfToken: string,
  source: readonly CatalogueSourceCategory[]
): Omit<CatalogueOverviewWorkspace, "openIcecat"> {
  const byCode = new Map(source.map((category) => [category.categoryCode, category] as const));
  const parents = normalizedParents(source);
  const children = new Map<string | undefined, CatalogueSourceCategory[]>();

  for (const category of source) {
    const parent = parents.get(category.categoryCode);
    const siblings = children.get(parent) ?? [];
    siblings.push(category);
    children.set(parent, siblings);
  }
  for (const siblings of children.values()) siblings.sort(compareCategories);

  const aggregateMemo = new Map<string, { products: number; liveProducts: number }>();
  function aggregate(categoryCode: string): { products: number; liveProducts: number } {
    const cached = aggregateMemo.get(categoryCode);
    if (cached) return cached;
    const category = byCode.get(categoryCode);
    if (!category) return { products: 0, liveProducts: 0 };

    let products = category.directProducts;
    let liveProducts = category.directLiveProducts;
    for (const child of children.get(categoryCode) ?? []) {
      const childAggregate = aggregate(child.categoryCode);
      products += childAggregate.products;
      liveProducts += childAggregate.liveProducts;
    }
    const result = { products, liveProducts };
    aggregateMemo.set(categoryCode, result);
    return result;
  }

  const ordered: CatalogueOverviewCategory[] = [];
  const visited = new Set<string>();
  function visit(category: CatalogueSourceCategory, depth: number, ancestorLabels: readonly string[]) {
    if (visited.has(category.categoryCode)) return;
    visited.add(category.categoryCode);
    const branch = aggregate(category.categoryCode);
    const pathLabels = [...ancestorLabels, category.labelEl];
    const directChildren = children.get(category.categoryCode) ?? [];

    ordered.push({
      categoryCode: category.categoryCode,
      labelEl: category.labelEl,
      parentCategoryCode: parents.get(category.categoryCode),
      depth,
      pathLabels,
      active: category.active,
      directProducts: category.directProducts,
      directLiveProducts: category.directLiveProducts,
      subtreeProducts: branch.products,
      subtreeLiveProducts: branch.liveProducts,
      childCount: directChildren.length
    });

    for (const child of directChildren) visit(child, depth + 1, pathLabels);
  }

  for (const root of children.get(undefined) ?? []) visit(root, 0, []);
  // Defensive fallback for malformed records that were not reachable from the normalized roots.
  for (const category of [...source].sort(compareCategories)) {
    if (!visited.has(category.categoryCode)) visit(category, 0, []);
  }

  return {
    csrfToken,
    categories: ordered,
    metrics: {
      totalCategories: ordered.length,
      activeCategories: ordered.filter((category) => category.active).length,
      rootCategories: ordered.filter((category) => category.depth === 0).length,
      leafCategories: ordered.filter((category) => category.childCount === 0).length,
      emptyCategories: ordered.filter((category) => category.subtreeProducts === 0).length,
      totalProducts: source.reduce((sum, category) => sum + category.directProducts, 0),
      liveProducts: source.reduce((sum, category) => sum + category.directLiveProducts, 0),
      taxonomyLevels: ordered.length === 0 ? 0 : Math.max(...ordered.map((category) => category.depth)) + 1
    }
  };
}

function buildOpenIcecatHealth(row: SqlRow): OpenIcecatAdminHealth {
  const activeIndexProducts = integer(row, "active_products");
  const missingGtin = integer(row, "without_gtin");
  const queueableProducts = Math.max(0, activeIndexProducts - missingGtin);
  const pending = integer(row, "pending");
  const processing = integer(row, "processing");
  const retry = integer(row, "retry");
  const ready = integer(row, "ready");
  const needsEnrichment = integer(row, "needs_enrichment");
  const failed = integer(row, "failed");
  const skipped = integer(row, "skipped");
  const detailProcessed = ready + needsEnrichment;

  return {
    state: "available",
    processingVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION,
    activeIndexProducts,
    queueableProducts,
    missingGtin,
    missingGtinPct: percentage(missingGtin, activeIndexProducts),
    detailProcessed,
    detailCoveragePct: percentage(detailProcessed, queueableProducts),
    readyCoveragePct: percentage(ready, queueableProducts),
    actionableBacklog: pending + processing + retry,
    completedLastHour: integer(row, "completed_last_hour"),
    oldestActionableAgeSeconds: nullableInteger(row, "oldest_actionable_age_seconds"),
    queue: {
      pending,
      processing,
      retry,
      ready,
      needsEnrichment,
      failed,
      skipped
    }
  };
}

async function postgresOpenIcecatHealth(runtime: ReturnType<typeof getProductionPostgresRuntime>): Promise<OpenIcecatAdminHealth> {
  const sourceUow = new PostgresUnitOfWork(runtime.sqlPool);
  let sourceId: string;
  try {
    const source = await sourceUow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(
        `SELECT s.id::text AS source_id
         FROM public.catalog_sources s
         JOIN public.markets m ON m.id=s.market_id
         WHERE s.code='open_icecat' AND s.active=true AND m.code='sparta'
         LIMIT 1`
      );
      return result.rows[0]?.source_id;
    }, { readOnly: true, statementTimeoutMs: 5_000 });
    if (typeof source !== "string" || !source) return { state: "not_configured" };
    sourceId = source;
  } catch {
    return { state: "unavailable" };
  }

  try {
    const statsUow = new PostgresUnitOfWork(runtime.sqlPool);
    return await statsUow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(
        `WITH index_stats AS (
           SELECT count(*) FILTER (WHERE record_state='active')::bigint AS active_products,
                  count(*) FILTER (WHERE record_state='active' AND cardinality(gtins)=0)::bigint AS without_gtin
           FROM public.open_icecat_index_products
           WHERE source_id=$1::uuid
         ), job_stats AS (
           SELECT count(*) FILTER (WHERE status='pending')::bigint AS pending,
                  count(*) FILTER (WHERE status='processing')::bigint AS processing,
                  count(*) FILTER (WHERE status='retry')::bigint AS retry,
                  count(*) FILTER (WHERE status='ready')::bigint AS ready,
                  count(*) FILTER (WHERE status='needs_enrichment')::bigint AS needs_enrichment,
                  count(*) FILTER (WHERE status='failed')::bigint AS failed,
                  count(*) FILTER (WHERE status='skipped')::bigint AS skipped,
                  count(*) FILTER (
                    WHERE status IN ('ready','needs_enrichment')
                      AND completed_at >= now() - interval '1 hour'
                  )::bigint AS completed_last_hour,
                  extract(epoch FROM (now() - min(updated_at) FILTER (
                    WHERE status IN ('pending','processing','retry')
                  )))::bigint AS oldest_actionable_age_seconds
           FROM public.open_icecat_detail_enrichment_jobs
           WHERE source_id=$1::uuid
             AND processing_version=$2
         )
         SELECT * FROM index_stats CROSS JOIN job_stats`,
        [sourceId, OPEN_ICECAT_DETAIL_PROCESSING_VERSION]
      );
      const row = result.rows[0];
      if (!row) return { state: "unavailable" } as const;
      return buildOpenIcecatHealth(row);
    }, { readOnly: true, statementTimeoutMs: 8_000 });
  } catch {
    // The catalogue workspace must remain usable if the enrichment schema is not deployed yet,
    // is being migrated, or is temporarily unavailable. Never leak DB/provider details to Admin UI.
    return { state: "unavailable" };
  }
}

async function postgresCatalogueOverview(principal: SessionPrincipal): Promise<CatalogueOverviewWorkspace> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  const catalogue = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(
      `SELECT
         c.code,
         COALESCE(ct.name, c.code) AS label,
         p.code AS parent_code,
         c.active,
         COUNT(cv.id)::int AS direct_products,
         COUNT(cv.id) FILTER (
           WHERE cv.active = TRUE
             AND cv.suppressed = FALSE
             AND cv.recalled = FALSE
         )::int AS direct_live_products
       FROM categories c
       JOIN markets m ON m.id = c.market_id
       LEFT JOIN categories p ON p.id = c.parent_id
       LEFT JOIN category_translations ct
         ON ct.category_id = c.id
        AND ct.locale = 'el'
       LEFT JOIN canonical_variants cv
         ON cv.category_id = c.id
        AND cv.market_id = m.id
       WHERE m.code = 'sparta'
       GROUP BY c.id, c.code, c.parent_id, p.code, c.active, ct.name
       ORDER BY label ASC, c.code ASC`
    );

    return buildCatalogueOverview(
      principal.csrfToken,
      result.rows.map((row) => ({
        categoryCode: text(row, "code"),
        labelEl: text(row, "label"),
        parentCategoryCode: optionalText(row, "parent_code"),
        active: booleanValue(row, "active"),
        directProducts: integer(row, "direct_products"),
        directLiveProducts: integer(row, "direct_live_products")
      }))
    );
  }, { readOnly: true });

  return {
    ...catalogue,
    openIcecat: await postgresOpenIcecatHealth(runtime)
  };
}

function memoryCatalogueOverview(principal: SessionPrincipal): CatalogueOverviewWorkspace {
  const categoryWorkspace = memory.adminCategoryWorkspace(principal);
  const canonicals = getVendorOperationsRuntime().catalog.canonicals({ marketId: "sparta" });
  const categories = new Map<string, CatalogueSourceCategory>();

  for (const category of categoryWorkspace.categories) {
    const products = canonicals.filter((canonical) => canonical.categoryCode === category.categoryCode);
    categories.set(category.categoryCode, {
      categoryCode: category.categoryCode,
      labelEl: category.labelEl,
      active: true,
      directProducts: products.length,
      directLiveProducts: products.filter(
        (canonical) => canonical.active && !canonical.suppressed && !canonical.recalled
      ).length
    });
  }

  // Preview data can contain a canonical category before the governance seed is updated. Keep it
  // visible instead of silently dropping those products from the overview.
  for (const canonical of canonicals) {
    if (categories.has(canonical.categoryCode)) continue;
    const products = canonicals.filter((candidate) => candidate.categoryCode === canonical.categoryCode);
    categories.set(canonical.categoryCode, {
      categoryCode: canonical.categoryCode,
      labelEl: canonical.categoryCode,
      active: true,
      directProducts: products.length,
      directLiveProducts: products.filter(
        (candidate) => candidate.active && !candidate.suppressed && !candidate.recalled
      ).length
    });
  }

  return {
    ...buildCatalogueOverview(principal.csrfToken, [...categories.values()]),
    openIcecat: { state: "not_configured" }
  };
}

export async function adminCatalogueOverviewWorkspace(
  principal: SessionPrincipal
): Promise<CatalogueOverviewWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  if (postgresAdminRuntimeEnabled()) return postgresCatalogueOverview(principal);
  return memoryCatalogueOverview(principal);
}
