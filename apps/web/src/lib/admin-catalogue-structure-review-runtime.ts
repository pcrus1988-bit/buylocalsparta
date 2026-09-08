import {
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueStructureReviewSummary = Readonly<{
  currentSourceProducts: number;
  unlinkedProducts: number;
  unclassifiedProducts: number;
  productsWithUnmappedAttributes: number;
  unmappedAttributeObservations: number;
  unmappedAttributeKeys: number;
  reviewRequiredAttributeObservations: number;
}>;

export type CatalogueStructureReviewProductScope = "unlinked" | "unclassified" | "attributes";

export type CatalogueStructureReviewProduct = Readonly<{
  id: string;
  snapshotId: string;
  sourceId: string;
  sourceName: string;
  sourceProductKey: string;
  supplierCode?: string;
  title: string;
  brand?: string;
  model?: string;
  sourceUrl?: string;
  taxonomyPath: readonly string[];
  approvedCategoryCode?: string;
  priceState: string;
  classificationStatus: string;
  unmappedAttributes: number;
  hasApprovedCanonicalLink: boolean;
}>;

export type CatalogueStructureReviewProductsPage = Readonly<{
  scope: CatalogueStructureReviewProductScope;
  products: readonly CatalogueStructureReviewProduct[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}>;

export type CatalogueStructureReviewAttributeSample = Readonly<{
  productId: string;
  title: string;
  rawValue: unknown;
}>;

export type CatalogueStructureReviewAttribute = Readonly<{
  snapshotId: string;
  sourceId: string;
  sourceName: string;
  sourceAttributeKey: string;
  observationCount: number;
  productCount: number;
  sourceUnits: readonly string[];
  contextCount: number;
  samples: readonly CatalogueStructureReviewAttributeSample[];
}>;

export type CatalogueStructureReviewAttributesPage = Readonly<{
  attributes: readonly CatalogueStructureReviewAttribute[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}>;

function text(row: SqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== "string") throw new Error(`Database field ${field} is not a string`);
  return value;
}

function optionalText(row: SqlRow, field: string): string | undefined {
  const value = row[field];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function integer(row: SqlRow, field: string): number {
  const value = Number(row[field] ?? 0);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Database field ${field} is not a non-negative safe integer`);
  return value;
}

function booleanValue(row: SqlRow, field: string): boolean {
  return row[field] === true;
}

function stringArray(row: SqlRow, field: string): readonly string[] {
  const value = row[field];
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function attributeSamples(row: SqlRow): readonly CatalogueStructureReviewAttributeSample[] {
  const value = row.samples;
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const productId = typeof record.productId === "string" ? record.productId : "";
    const title = typeof record.title === "string" ? record.title : "";
    return productId && title ? [{ productId, title, rawValue: record.rawValue }] : [];
  });
}

const CURRENT_PRODUCTS_CTE = `
  WITH latest_snapshots AS (
    SELECT DISTINCT ON (source_id) id, source_id
    FROM public.catalog_source_snapshots
    ORDER BY source_id, created_at DESC, id DESC
  ), current_products AS (
    SELECT sp.*
    FROM public.catalog_source_products sp
    JOIN latest_snapshots ls ON ls.id = sp.snapshot_id
  )
`;

export async function adminCatalogueStructureReviewSummary(
  principal: SessionPrincipal
): Promise<CatalogueStructureReviewSummary> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) {
    return {
      currentSourceProducts: 0,
      unlinkedProducts: 0,
      unclassifiedProducts: 0,
      productsWithUnmappedAttributes: 0,
      unmappedAttributeObservations: 0,
      unmappedAttributeKeys: 0,
      reviewRequiredAttributeObservations: 0
    };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`${CURRENT_PRODUCTS_CTE}
      SELECT
        (SELECT COUNT(*)::int FROM current_products) AS current_source_products,
        (SELECT COUNT(*)::int
           FROM current_products cp
          WHERE NOT EXISTS (
            SELECT 1 FROM public.catalog_source_product_links l
            WHERE l.source_product_id = cp.id AND l.link_status = 'approved'
          )) AS unlinked_products,
        (SELECT COUNT(*)::int
           FROM current_products cp
          WHERE cp.source_taxonomy_node_id IS NULL
             OR NOT EXISTS (
               SELECT 1 FROM public.catalog_source_category_mappings m
               WHERE m.source_taxonomy_node_id = cp.source_taxonomy_node_id
                 AND m.mapping_status = 'approved'
             )) AS unclassified_products,
        (SELECT COUNT(DISTINCT a.source_product_id)::int
           FROM public.catalog_source_attribute_observations a
           JOIN current_products cp ON cp.id = a.source_product_id
          WHERE a.mapping_status = 'unmapped' AND a.attribute_id IS NULL) AS products_with_unmapped_attributes,
        (SELECT COUNT(*)::int
           FROM public.catalog_source_attribute_observations a
           JOIN current_products cp ON cp.id = a.source_product_id
          WHERE a.mapping_status = 'unmapped' AND a.attribute_id IS NULL) AS unmapped_attribute_observations,
        (SELECT COUNT(DISTINCT (cp.source_id, a.source_attribute_key))::int
           FROM public.catalog_source_attribute_observations a
           JOIN current_products cp ON cp.id = a.source_product_id
          WHERE a.mapping_status = 'unmapped' AND a.attribute_id IS NULL) AS unmapped_attribute_keys,
        (SELECT COUNT(*)::int
           FROM public.catalog_source_attribute_observations a
           JOIN current_products cp ON cp.id = a.source_product_id
          WHERE a.mapping_status = 'review_required') AS review_required_attribute_observations
    `);
    const row = result.rows[0] ?? {};
    return {
      currentSourceProducts: integer(row, "current_source_products"),
      unlinkedProducts: integer(row, "unlinked_products"),
      unclassifiedProducts: integer(row, "unclassified_products"),
      productsWithUnmappedAttributes: integer(row, "products_with_unmapped_attributes"),
      unmappedAttributeObservations: integer(row, "unmapped_attribute_observations"),
      unmappedAttributeKeys: integer(row, "unmapped_attribute_keys"),
      reviewRequiredAttributeObservations: integer(row, "review_required_attribute_observations")
    };
  }, { readOnly: true, statementTimeoutMs: 15_000 });
}

function productScopeWhere(scope: CatalogueStructureReviewProductScope): string {
  if (scope === "unclassified") {
    return `(
      cp.source_taxonomy_node_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.catalog_source_category_mappings m
        WHERE m.source_taxonomy_node_id = cp.source_taxonomy_node_id
          AND m.mapping_status = 'approved'
      )
    )`;
  }
  if (scope === "attributes") {
    return `EXISTS (
      SELECT 1 FROM public.catalog_source_attribute_observations a
      WHERE a.source_product_id = cp.id
        AND a.mapping_status = 'unmapped'
        AND a.attribute_id IS NULL
    )`;
  }
  return `NOT EXISTS (
    SELECT 1 FROM public.catalog_source_product_links l
    WHERE l.source_product_id = cp.id AND l.link_status = 'approved'
  )`;
}

export async function adminCatalogueStructureReviewProducts(
  principal: SessionPrincipal,
  options: Readonly<{
    scope?: CatalogueStructureReviewProductScope;
    q?: string;
    offset?: number;
    limit?: number;
  }> = {}
): Promise<CatalogueStructureReviewProductsPage> {
  assertAdminPermission(principal, "catalog.read");
  const scope: CatalogueStructureReviewProductScope = options.scope === "unclassified" || options.scope === "attributes" ? options.scope : "unlinked";
  const q = options.q?.trim() || undefined;
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 50)));
  if (!postgresAdminRuntimeEnabled()) return { scope, products: [], total: 0, offset, limit, hasMore: false };

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 2_000 });
  const scopeWhere = productScopeWhere(scope);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const queryFilter = `
      ${scopeWhere}
      AND ($1::text IS NULL
        OR cp.title ILIKE '%' || $1 || '%'
        OR cp.source_product_key ILIKE '%' || $1 || '%'
        OR COALESCE(cp.supplier_code, '') ILIKE '%' || $1 || '%'
        OR COALESCE(cp.source_identity->>'brand', '') ILIKE '%' || $1 || '%'
        OR COALESCE(cp.source_identity->>'model', '') ILIKE '%' || $1 || '%')
    `;

    const [rows, totalRows] = await Promise.all([
      tx.query<SqlRow>(`${CURRENT_PRODUCTS_CTE}
        SELECT
          cp.id::text AS id,
          cp.snapshot_id::text AS snapshot_id,
          cp.source_id::text AS source_id,
          s.name AS source_name,
          cp.source_product_key,
          cp.supplier_code,
          cp.title,
          NULLIF(btrim(cp.source_identity->>'brand'), '') AS brand,
          NULLIF(btrim(cp.source_identity->>'model'), '') AS model,
          cp.source_url,
          COALESCE(t.path_labels, ARRAY[]::text[]) AS taxonomy_path,
          (
            SELECT c.code
            FROM public.catalog_source_category_mappings m
            JOIN public.categories c ON c.id = m.category_id
            WHERE m.source_taxonomy_node_id = cp.source_taxonomy_node_id
              AND m.mapping_status = 'approved'
            ORDER BY c.code
            LIMIT 1
          ) AS approved_category_code,
          cp.price_state,
          cp.classification_status,
          (
            SELECT COUNT(*)::int
            FROM public.catalog_source_attribute_observations a
            WHERE a.source_product_id = cp.id
              AND a.mapping_status = 'unmapped'
              AND a.attribute_id IS NULL
          ) AS unmapped_attributes,
          EXISTS (
            SELECT 1 FROM public.catalog_source_product_links l
            WHERE l.source_product_id = cp.id AND l.link_status = 'approved'
          ) AS has_approved_canonical_link
        FROM current_products cp
        JOIN public.catalog_sources s ON s.id = cp.source_id
        LEFT JOIN public.catalog_source_taxonomy_nodes t ON t.id = cp.source_taxonomy_node_id
        WHERE ${queryFilter}
        ORDER BY
          (cp.source_taxonomy_node_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.catalog_source_category_mappings m
            WHERE m.source_taxonomy_node_id = cp.source_taxonomy_node_id
              AND m.mapping_status = 'approved'
          )) DESC,
          (SELECT COUNT(*) FROM public.catalog_source_attribute_observations a
            WHERE a.source_product_id = cp.id AND a.mapping_status = 'unmapped' AND a.attribute_id IS NULL) DESC,
          s.name ASC, cp.title ASC, cp.id ASC
        LIMIT $2 OFFSET $3
      `, [q ?? null, limit, offset]),
      tx.query<SqlRow>(`${CURRENT_PRODUCTS_CTE}
        SELECT COUNT(*)::int AS total
        FROM current_products cp
        WHERE ${queryFilter}
      `, [q ?? null])
    ]);

    const total = integer(totalRows.rows[0] ?? {}, "total");
    return {
      scope,
      products: rows.rows.map((row) => ({
        id: text(row, "id"),
        snapshotId: text(row, "snapshot_id"),
        sourceId: text(row, "source_id"),
        sourceName: text(row, "source_name"),
        sourceProductKey: text(row, "source_product_key"),
        supplierCode: optionalText(row, "supplier_code"),
        title: text(row, "title"),
        brand: optionalText(row, "brand"),
        model: optionalText(row, "model"),
        sourceUrl: optionalText(row, "source_url"),
        taxonomyPath: stringArray(row, "taxonomy_path"),
        approvedCategoryCode: optionalText(row, "approved_category_code"),
        priceState: text(row, "price_state"),
        classificationStatus: text(row, "classification_status"),
        unmappedAttributes: integer(row, "unmapped_attributes"),
        hasApprovedCanonicalLink: booleanValue(row, "has_approved_canonical_link")
      })),
      total,
      offset,
      limit,
      hasMore: offset + rows.rows.length < total
    };
  }, { readOnly: true, statementTimeoutMs: 15_000 });
}

export async function adminCatalogueStructureReviewAttributes(
  principal: SessionPrincipal,
  options: Readonly<{ q?: string; offset?: number; limit?: number }> = {}
): Promise<CatalogueStructureReviewAttributesPage> {
  assertAdminPermission(principal, "catalog.read");
  const q = options.q?.trim() || undefined;
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 50)));
  if (!postgresAdminRuntimeEnabled()) return { attributes: [], total: 0, offset, limit, hasMore: false };

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const groupedCte = `${CURRENT_PRODUCTS_CTE}, current_observations AS (
      SELECT
        a.id,
        a.source_product_id,
        a.source_attribute_key,
        NULLIF(btrim(a.source_unit), '') AS source_unit,
        a.raw_value,
        a.created_at,
        cp.snapshot_id,
        cp.source_id,
        cp.title,
        cp.source_taxonomy_node_id
      FROM public.catalog_source_attribute_observations a
      JOIN current_products cp ON cp.id = a.source_product_id
      WHERE a.mapping_status = 'unmapped' AND a.attribute_id IS NULL
    ), grouped AS (
      SELECT
        source_id,
        snapshot_id,
        source_attribute_key,
        COUNT(*)::int AS observation_count,
        COUNT(DISTINCT source_product_id)::int AS product_count,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT source_unit ORDER BY source_unit), NULL) AS source_units,
        COUNT(DISTINCT source_taxonomy_node_id)::int AS context_count
      FROM current_observations
      GROUP BY source_id, snapshot_id, source_attribute_key
    )`;

    const [rows, totalRows] = await Promise.all([
      tx.query<SqlRow>(`${groupedCte}
        SELECT
          g.snapshot_id::text AS snapshot_id,
          g.source_id::text AS source_id,
          s.name AS source_name,
          g.source_attribute_key,
          g.observation_count,
          g.product_count,
          g.source_units,
          g.context_count,
          COALESCE((
            SELECT JSONB_AGG(sample.payload ORDER BY sample.created_at, sample.id)
            FROM (
              SELECT
                JSONB_BUILD_OBJECT(
                  'productId', co.source_product_id::text,
                  'title', co.title,
                  'rawValue', co.raw_value
                ) AS payload,
                co.created_at,
                co.id
              FROM current_observations co
              WHERE co.source_id = g.source_id
                AND co.source_attribute_key = g.source_attribute_key
              ORDER BY co.created_at ASC, co.id ASC
              LIMIT 5
            ) sample
          ), '[]'::jsonb) AS samples
        FROM grouped g
        JOIN public.catalog_sources s ON s.id = g.source_id
        WHERE $1::text IS NULL
           OR g.source_attribute_key ILIKE '%' || $1 || '%'
           OR s.name ILIKE '%' || $1 || '%'
        ORDER BY g.observation_count DESC, s.name ASC, g.source_attribute_key ASC
        LIMIT $2 OFFSET $3
      `, [q ?? null, limit, offset]),
      tx.query<SqlRow>(`${groupedCte}
        SELECT COUNT(*)::int AS total
        FROM grouped g
        JOIN public.catalog_sources s ON s.id = g.source_id
        WHERE $1::text IS NULL
           OR g.source_attribute_key ILIKE '%' || $1 || '%'
           OR s.name ILIKE '%' || $1 || '%'
      `, [q ?? null])
    ]);

    const total = integer(totalRows.rows[0] ?? {}, "total");
    return {
      attributes: rows.rows.map((row) => ({
        snapshotId: text(row, "snapshot_id"),
        sourceId: text(row, "source_id"),
        sourceName: text(row, "source_name"),
        sourceAttributeKey: text(row, "source_attribute_key"),
        observationCount: integer(row, "observation_count"),
        productCount: integer(row, "product_count"),
        sourceUnits: stringArray(row, "source_units"),
        contextCount: integer(row, "context_count"),
        samples: attributeSamples(row)
      })),
      total,
      offset,
      limit,
      hasMore: offset + rows.rows.length < total
    };
  }, { readOnly: true, statementTimeoutMs: 15_000 });
}
