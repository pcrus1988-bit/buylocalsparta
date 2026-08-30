import {
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
  taxonomyRole?: string;
  assignable?: boolean;
  discoverable?: boolean;
  active: boolean;
  directProducts: number;
  directLiveProducts: number;
  directIcecatLinkedProducts?: number;
  directIcecatGreekReadyProducts?: number;
  directAttributeObservations?: number;
  directMappedAttributeObservations?: number;
  directUnmappedAttributeObservations?: number;
  directReviewRequiredAttributeObservations?: number;
}>;

export type CatalogueOverviewHealth = Readonly<{
  available: boolean;
  sourceProducts: number;
  unlinkedSourceProducts: number;
  attributeObservations: number;
  mappedAttributeObservations: number;
  unmappedAttributeObservations: number;
  reviewRequiredAttributeObservations: number;
  icecatSourceProducts: number;
  icecatGreekReadySourceProducts: number;
  icecatQueued: number;
  icecatReady: number;
  icecatNeedsEnrichment: number;
  icecatFailed: number;
}>;

export type CatalogueOverviewCategory = Readonly<{
  categoryCode: string;
  labelEl: string;
  parentCategoryCode?: string;
  taxonomyRole: string;
  assignable: boolean;
  discoverable: boolean;
  depth: number;
  pathLabels: readonly string[];
  active: boolean;
  directProducts: number;
  directLiveProducts: number;
  subtreeProducts: number;
  subtreeLiveProducts: number;
  childCount: number;
  directIcecatLinkedProducts: number;
  directIcecatGreekReadyProducts: number;
  subtreeIcecatLinkedProducts: number;
  subtreeIcecatGreekReadyProducts: number;
  directAttributeObservations: number;
  directMappedAttributeObservations: number;
  directUnmappedAttributeObservations: number;
  directReviewRequiredAttributeObservations: number;
  subtreeAttributeObservations: number;
  subtreeMappedAttributeObservations: number;
  subtreeUnmappedAttributeObservations: number;
  subtreeReviewRequiredAttributeObservations: number;
}>;

export type CatalogueOverviewUnmappedAttribute = Readonly<{
  sourceName: string;
  sourceAttributeKey: string;
  observationCount: number;
  productCount: number;
}>;

export type CatalogueOverviewAttributeMetrics = Readonly<{
  totalAttributeDefinitions: number;
  activeAttributeDefinitions: number;
  totalProductTypes: number;
  activeProductTypes: number;
  productTypeAttributeAssignments: number;
  approvedMappingRules: number;
  mappedObservations: number;
  reviewRequiredObservations: number;
  unmappedObservations: number;
  semanticCoveragePct: number;
}>;

export type CatalogueOverviewWorkspace = Readonly<{
  csrfToken: string;
  categories: readonly CatalogueOverviewCategory[];
  health: CatalogueOverviewHealth;
  unmappedAttributes: readonly CatalogueOverviewUnmappedAttribute[];
  attributes: CatalogueOverviewAttributeMetrics;
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
}>;

type CatalogueOverviewSupplement = Readonly<{
  health?: CatalogueOverviewHealth;
  attributes?: Partial<CatalogueOverviewAttributeMetrics>;
  unmappedAttributes?: readonly CatalogueOverviewUnmappedAttribute[];
}>;

const UNAVAILABLE_HEALTH: CatalogueOverviewHealth = {
  available: false,
  sourceProducts: 0,
  unlinkedSourceProducts: 0,
  attributeObservations: 0,
  mappedAttributeObservations: 0,
  unmappedAttributeObservations: 0,
  reviewRequiredAttributeObservations: 0,
  icecatSourceProducts: 0,
  icecatGreekReadySourceProducts: 0,
  icecatQueued: 0,
  icecatReady: 0,
  icecatNeedsEnrichment: 0,
  icecatFailed: 0
};

const EMPTY_ATTRIBUTE_METRICS: CatalogueOverviewAttributeMetrics = {
  totalAttributeDefinitions: 0,
  activeAttributeDefinitions: 0,
  totalProductTypes: 0,
  activeProductTypes: 0,
  productTypeAttributeAssignments: 0,
  approvedMappingRules: 0,
  mappedObservations: 0,
  reviewRequiredObservations: 0,
  unmappedObservations: 0,
  semanticCoveragePct: 0
};

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

function normalizedAttributeMetrics(input?: Partial<CatalogueOverviewAttributeMetrics>): CatalogueOverviewAttributeMetrics {
  const metrics = { ...EMPTY_ATTRIBUTE_METRICS, ...input };
  const totalObservations = metrics.mappedObservations + metrics.reviewRequiredObservations + metrics.unmappedObservations;
  const resolvedObservations = metrics.mappedObservations + metrics.reviewRequiredObservations;
  return {
    ...metrics,
    semanticCoveragePct: totalObservations === 0
      ? 0
      : Math.round((resolvedObservations / totalObservations) * 100)
  };
}

type BranchAggregate = {
  products: number;
  liveProducts: number;
  icecatLinkedProducts: number;
  icecatGreekReadyProducts: number;
  attributeObservations: number;
  mappedAttributeObservations: number;
  unmappedAttributeObservations: number;
  reviewRequiredAttributeObservations: number;
};

export function buildCatalogueOverview(
  csrfToken: string,
  source: readonly CatalogueSourceCategory[],
  supplement: CatalogueOverviewSupplement = {}
): CatalogueOverviewWorkspace {
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

  const aggregateMemo = new Map<string, BranchAggregate>();
  function aggregate(categoryCode: string): BranchAggregate {
    const cached = aggregateMemo.get(categoryCode);
    if (cached) return cached;
    const category = byCode.get(categoryCode);
    if (!category) {
      return {
        products: 0,
        liveProducts: 0,
        icecatLinkedProducts: 0,
        icecatGreekReadyProducts: 0,
        attributeObservations: 0,
        mappedAttributeObservations: 0,
        unmappedAttributeObservations: 0,
        reviewRequiredAttributeObservations: 0
      };
    }

    const result: BranchAggregate = {
      products: category.directProducts,
      liveProducts: category.directLiveProducts,
      icecatLinkedProducts: category.directIcecatLinkedProducts ?? 0,
      icecatGreekReadyProducts: category.directIcecatGreekReadyProducts ?? 0,
      attributeObservations: category.directAttributeObservations ?? 0,
      mappedAttributeObservations: category.directMappedAttributeObservations ?? 0,
      unmappedAttributeObservations: category.directUnmappedAttributeObservations ?? 0,
      reviewRequiredAttributeObservations: category.directReviewRequiredAttributeObservations ?? 0
    };
    for (const child of children.get(categoryCode) ?? []) {
      const childAggregate = aggregate(child.categoryCode);
      result.products += childAggregate.products;
      result.liveProducts += childAggregate.liveProducts;
      result.icecatLinkedProducts += childAggregate.icecatLinkedProducts;
      result.icecatGreekReadyProducts += childAggregate.icecatGreekReadyProducts;
      result.attributeObservations += childAggregate.attributeObservations;
      result.mappedAttributeObservations += childAggregate.mappedAttributeObservations;
      result.unmappedAttributeObservations += childAggregate.unmappedAttributeObservations;
      result.reviewRequiredAttributeObservations += childAggregate.reviewRequiredAttributeObservations;
    }
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
      taxonomyRole: category.taxonomyRole ?? "category",
      assignable: category.assignable ?? true,
      discoverable: category.discoverable ?? true,
      depth,
      pathLabels,
      active: category.active,
      directProducts: category.directProducts,
      directLiveProducts: category.directLiveProducts,
      subtreeProducts: branch.products,
      subtreeLiveProducts: branch.liveProducts,
      childCount: directChildren.length,
      directIcecatLinkedProducts: category.directIcecatLinkedProducts ?? 0,
      directIcecatGreekReadyProducts: category.directIcecatGreekReadyProducts ?? 0,
      subtreeIcecatLinkedProducts: branch.icecatLinkedProducts,
      subtreeIcecatGreekReadyProducts: branch.icecatGreekReadyProducts,
      directAttributeObservations: category.directAttributeObservations ?? 0,
      directMappedAttributeObservations: category.directMappedAttributeObservations ?? 0,
      directUnmappedAttributeObservations: category.directUnmappedAttributeObservations ?? 0,
      directReviewRequiredAttributeObservations: category.directReviewRequiredAttributeObservations ?? 0,
      subtreeAttributeObservations: branch.attributeObservations,
      subtreeMappedAttributeObservations: branch.mappedAttributeObservations,
      subtreeUnmappedAttributeObservations: branch.unmappedAttributeObservations,
      subtreeReviewRequiredAttributeObservations: branch.reviewRequiredAttributeObservations
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
    health: supplement.health ?? UNAVAILABLE_HEALTH,
    unmappedAttributes: supplement.unmappedAttributes ?? [],
    attributes: normalizedAttributeMetrics(supplement.attributes),
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

async function postgresCatalogueOverview(principal: SessionPrincipal): Promise<CatalogueOverviewWorkspace> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const [categoryResult, schemaMetricResult, unmappedAttributeResult, healthResult] = await Promise.all([
      tx.query<SqlRow>(
        `WITH canonical_counts AS (
           SELECT
             cv.category_id,
             COUNT(*)::int AS direct_products,
             COUNT(*) FILTER (
               WHERE cv.active = TRUE
                 AND cv.suppressed = FALSE
                 AND cv.recalled = FALSE
             )::int AS direct_live_products
           FROM canonical_variants cv
           JOIN markets m ON m.id = cv.market_id
           WHERE m.code = 'sparta'
           GROUP BY cv.category_id
         ), linked_health AS (
           SELECT
             cv.category_id,
             COUNT(DISTINCT cv.id) FILTER (WHERE cs.code = 'open_icecat')::int AS direct_icecat_linked_products,
             COUNT(DISTINCT cv.id) FILTER (
               WHERE cs.code = 'open_icecat' AND loc.publish_eligible = TRUE
             )::int AS direct_icecat_greek_ready_products,
             COUNT(a.id)::int AS direct_attribute_observations,
             COUNT(a.id) FILTER (WHERE a.mapping_status = 'mapped')::int AS direct_mapped_attribute_observations,
             COUNT(a.id) FILTER (WHERE a.mapping_status = 'unmapped')::int AS direct_unmapped_attribute_observations,
             COUNT(a.id) FILTER (WHERE a.mapping_status = 'review_required')::int AS direct_review_required_attribute_observations
           FROM canonical_variants cv
           JOIN markets m ON m.id = cv.market_id
           JOIN catalog_source_product_links link
             ON link.canonical_variant_id = cv.id
            AND link.link_status = 'approved'
           JOIN catalog_source_products sp ON sp.id = link.source_product_id
           JOIN catalog_sources cs ON cs.id = sp.source_id AND cs.market_id = m.id
           LEFT JOIN catalog_source_product_localizations loc
             ON loc.source_product_id = sp.id
            AND loc.locale = 'EL'
           LEFT JOIN catalog_source_attribute_observations a ON a.source_product_id = sp.id
           WHERE m.code = 'sparta'
           GROUP BY cv.category_id
         )
         SELECT
           c.code,
           COALESCE(ct.name, c.code) AS label,
           p.code AS parent_code,
           c.taxonomy_role,
           c.assignable,
           c.discoverable,
           c.active,
           COALESCE(cc.direct_products, 0)::int AS direct_products,
           COALESCE(cc.direct_live_products, 0)::int AS direct_live_products,
           COALESCE(lh.direct_icecat_linked_products, 0)::int AS direct_icecat_linked_products,
           COALESCE(lh.direct_icecat_greek_ready_products, 0)::int AS direct_icecat_greek_ready_products,
           COALESCE(lh.direct_attribute_observations, 0)::int AS direct_attribute_observations,
           COALESCE(lh.direct_mapped_attribute_observations, 0)::int AS direct_mapped_attribute_observations,
           COALESCE(lh.direct_unmapped_attribute_observations, 0)::int AS direct_unmapped_attribute_observations,
           COALESCE(lh.direct_review_required_attribute_observations, 0)::int AS direct_review_required_attribute_observations
         FROM categories c
         JOIN markets m ON m.id = c.market_id
         LEFT JOIN categories p ON p.id = c.parent_id
         LEFT JOIN category_translations ct
           ON ct.category_id = c.id
          AND ct.locale = 'el'
         LEFT JOIN canonical_counts cc ON cc.category_id = c.id
         LEFT JOIN linked_health lh ON lh.category_id = c.id
         WHERE m.code = 'sparta'
         ORDER BY label ASC, c.code ASC`
      ),
      tx.query<SqlRow>(
        `SELECT
           (SELECT COUNT(*)::int FROM attribute_definitions) AS total_attribute_definitions,
           (SELECT COUNT(*)::int FROM attribute_definitions WHERE active = TRUE) AS active_attribute_definitions,
           (SELECT COUNT(*)::int FROM product_types) AS total_product_types,
           (SELECT COUNT(*)::int FROM product_types WHERE status = 'active') AS active_product_types,
           (SELECT COUNT(*)::int FROM product_type_attributes) AS product_type_attribute_assignments,
           (
             SELECT COUNT(*)::int
             FROM catalog_source_attribute_mapping_rules r
             JOIN catalog_sources cs ON cs.id = r.source_id
             JOIN markets m ON m.id = cs.market_id
             WHERE r.status = 'approved' AND m.code = 'sparta'
           ) AS approved_mapping_rules`
      ),
      tx.query<SqlRow>(
        `SELECT
           s.name AS source_name,
           a.source_attribute_key,
           COUNT(*)::int AS observation_count,
           COUNT(DISTINCT a.source_product_id)::int AS product_count
         FROM catalog_source_attribute_observations a
         JOIN catalog_source_products sp ON sp.id = a.source_product_id
         JOIN catalog_sources s ON s.id = sp.source_id
         JOIN markets m ON m.id = s.market_id
         WHERE m.code = 'sparta'
           AND a.mapping_status = 'unmapped'
           AND a.attribute_id IS NULL
         GROUP BY s.id, s.name, a.source_attribute_key
         ORDER BY observation_count DESC, product_count DESC, s.name, a.source_attribute_key
         LIMIT 10`
      ),
      tx.query<SqlRow>(
        `WITH market_sources AS (
           SELECT sp.id, cs.code
           FROM catalog_source_products sp
           JOIN catalog_sources cs ON cs.id = sp.source_id
           JOIN markets m ON m.id = cs.market_id
           WHERE m.code = 'sparta'
         ), source_counts AS (
           SELECT
             COUNT(*)::int AS source_products,
             COUNT(*) FILTER (
               WHERE NOT EXISTS (
                 SELECT 1
                 FROM catalog_source_product_links link
                 WHERE link.source_product_id = ms.id
                   AND link.link_status = 'approved'
               )
             )::int AS unlinked_source_products,
             COUNT(*) FILTER (WHERE ms.code = 'open_icecat')::int AS icecat_source_products,
             COUNT(*) FILTER (
               WHERE ms.code = 'open_icecat'
                 AND EXISTS (
                   SELECT 1
                   FROM catalog_source_product_localizations loc
                   WHERE loc.source_product_id = ms.id
                     AND loc.locale = 'EL'
                     AND loc.publish_eligible = TRUE
                 )
             )::int AS icecat_greek_ready_source_products
           FROM market_sources ms
         ), attribute_counts AS (
           SELECT
             COUNT(a.id)::int AS attribute_observations,
             COUNT(a.id) FILTER (WHERE a.mapping_status = 'mapped')::int AS mapped_attribute_observations,
             COUNT(a.id) FILTER (WHERE a.mapping_status = 'unmapped')::int AS unmapped_attribute_observations,
             COUNT(a.id) FILTER (WHERE a.mapping_status = 'review_required')::int AS review_required_attribute_observations
           FROM catalog_source_attribute_observations a
           JOIN market_sources ms ON ms.id = a.source_product_id
         ), icecat_jobs AS (
           SELECT
             COUNT(*) FILTER (WHERE job.status IN ('pending', 'processing', 'retry'))::int AS icecat_queued,
             COUNT(*) FILTER (WHERE job.status = 'ready')::int AS icecat_ready,
             COUNT(*) FILTER (WHERE job.status = 'needs_enrichment')::int AS icecat_needs_enrichment,
             COUNT(*) FILTER (WHERE job.status = 'failed')::int AS icecat_failed
           FROM open_icecat_detail_enrichment_jobs job
           JOIN catalog_sources cs ON cs.id = job.source_id
           JOIN markets m ON m.id = cs.market_id
           WHERE m.code = 'sparta' AND cs.code = 'open_icecat'
         )
         SELECT * FROM source_counts CROSS JOIN attribute_counts CROSS JOIN icecat_jobs`
      )
    ]);

    const schemaRow = schemaMetricResult.rows[0] ?? {};
    const healthRow = healthResult.rows[0] ?? {};
    const health: CatalogueOverviewHealth = {
      available: true,
      sourceProducts: integer(healthRow, "source_products"),
      unlinkedSourceProducts: integer(healthRow, "unlinked_source_products"),
      attributeObservations: integer(healthRow, "attribute_observations"),
      mappedAttributeObservations: integer(healthRow, "mapped_attribute_observations"),
      unmappedAttributeObservations: integer(healthRow, "unmapped_attribute_observations"),
      reviewRequiredAttributeObservations: integer(healthRow, "review_required_attribute_observations"),
      icecatSourceProducts: integer(healthRow, "icecat_source_products"),
      icecatGreekReadySourceProducts: integer(healthRow, "icecat_greek_ready_source_products"),
      icecatQueued: integer(healthRow, "icecat_queued"),
      icecatReady: integer(healthRow, "icecat_ready"),
      icecatNeedsEnrichment: integer(healthRow, "icecat_needs_enrichment"),
      icecatFailed: integer(healthRow, "icecat_failed")
    };

    return buildCatalogueOverview(
      principal.csrfToken,
      categoryResult.rows.map((row) => ({
        categoryCode: text(row, "code"),
        labelEl: text(row, "label"),
        parentCategoryCode: optionalText(row, "parent_code"),
        taxonomyRole: text(row, "taxonomy_role"),
        assignable: booleanValue(row, "assignable"),
        discoverable: booleanValue(row, "discoverable"),
        active: booleanValue(row, "active"),
        directProducts: integer(row, "direct_products"),
        directLiveProducts: integer(row, "direct_live_products"),
        directIcecatLinkedProducts: integer(row, "direct_icecat_linked_products"),
        directIcecatGreekReadyProducts: integer(row, "direct_icecat_greek_ready_products"),
        directAttributeObservations: integer(row, "direct_attribute_observations"),
        directMappedAttributeObservations: integer(row, "direct_mapped_attribute_observations"),
        directUnmappedAttributeObservations: integer(row, "direct_unmapped_attribute_observations"),
        directReviewRequiredAttributeObservations: integer(row, "direct_review_required_attribute_observations")
      })),
      {
        health,
        attributes: {
          totalAttributeDefinitions: integer(schemaRow, "total_attribute_definitions"),
          activeAttributeDefinitions: integer(schemaRow, "active_attribute_definitions"),
          totalProductTypes: integer(schemaRow, "total_product_types"),
          activeProductTypes: integer(schemaRow, "active_product_types"),
          productTypeAttributeAssignments: integer(schemaRow, "product_type_attribute_assignments"),
          approvedMappingRules: integer(schemaRow, "approved_mapping_rules"),
          mappedObservations: health.mappedAttributeObservations,
          reviewRequiredObservations: health.reviewRequiredAttributeObservations,
          unmappedObservations: health.unmappedAttributeObservations
        },
        unmappedAttributes: unmappedAttributeResult.rows.map((row) => ({
          sourceName: text(row, "source_name"),
          sourceAttributeKey: text(row, "source_attribute_key"),
          observationCount: integer(row, "observation_count"),
          productCount: integer(row, "product_count")
        }))
      }
    );
  }, { readOnly: true });
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
      taxonomyRole: "category",
      assignable: true,
      discoverable: true,
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
      taxonomyRole: "category",
      assignable: true,
      discoverable: true,
      active: true,
      directProducts: products.length,
      directLiveProducts: products.filter(
        (candidate) => candidate.active && !candidate.suppressed && !candidate.recalled
      ).length
    });
  }

  return buildCatalogueOverview(principal.csrfToken, [...categories.values()]);
}

export async function adminCatalogueOverviewWorkspace(
  principal: SessionPrincipal
): Promise<CatalogueOverviewWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  if (postgresAdminRuntimeEnabled()) return postgresCatalogueOverview(principal);
  return memoryCatalogueOverview(principal);
}
