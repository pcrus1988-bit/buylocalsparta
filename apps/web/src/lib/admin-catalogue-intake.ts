import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueIntakeSnapshot = Readonly<{
  id: string;
  sourceId: string;
  sourceCode: string;
  sourceName: string;
  sourceFilename?: string;
  sourceHash: string;
  sourceVersion?: string;
  observedAt?: number;
  createdAt: number;
  declaredRowCount?: number;
  productCount: number;
  priceMatched: number;
  priceUnpriced: number;
  priceConflict: number;
  priceReviewRequired: number;
  classificationReviewRequired: number;
  unmappedAttributes: number;
  candidateCompatibility: number;
  candidateLinks: number;
  candidateCategoryMappings: number;
  approvedCategoryMappings: number;
}>;

export type CatalogueIntakeQueueItem = Readonly<{
  id: string;
  sourceProductKey: string;
  supplierCode?: string;
  title: string;
  brand?: string;
  model?: string;
  priceState: string;
  classificationStatus: string;
  sourceUrl?: string;
  taxonomyPath: readonly string[];
  appCategoryCode?: string;
  unmappedAttributes: number;
  candidateCompatibility: number;
  candidateLinks: number;
  categoryCandidates: number;
  categoryApproved: number;
  priceObservations: number;
  reviewReasons: readonly string[];
}>;

export type CatalogueIntakeDetail = Readonly<{
  product: CatalogueIntakeQueueItem & Readonly<{
    sourceName: string;
    sourceFilename?: string;
    sourceHash: string;
    gtinCandidate?: string;
    gtinStatus?: string;
    normalizedPayload: Readonly<Record<string, unknown>>;
    qualityPayload: Readonly<Record<string, unknown>>;
  }>;
  prices: readonly Readonly<{
    amountMinor: number;
    currency: string;
    kind: string;
    status: string;
    confidence?: number;
    matchMethod?: string;
    sourceReference?: string;
    observedAt?: number;
  }>[];
  attributes: readonly Readonly<{
    sourceKey: string;
    attributeCode?: string;
    mappingStatus: string;
    sourceUnit?: string;
    rawValue: unknown;
    normalizedValue?: unknown;
    confidence?: number;
  }>[];
  compatibility: readonly Readonly<{
    targetKind: string;
    targetReference?: string;
    platformName?: string;
    relationshipType: string;
    evidenceLevel: string;
    reviewStatus: string;
    confidence: number;
    sourceReference?: string;
  }>[];
  links: readonly Readonly<{
    canonicalVariantId: string;
    linkStatus: string;
    matchMethod: string;
    confidence?: number;
  }>[];
  categoryMappings: readonly Readonly<{
    categoryCode: string;
    mappingStatus: string;
    mappingMethod: string;
    confidence?: number;
    reason?: string;
  }>[];
}>;

export type CatalogueIntakeFilters = Readonly<{
  snapshotId?: string;
  q?: string;
  priceState?: string;
  classificationStatus?: string;
  productId?: string;
}>;

export type AdminCatalogueIntakeWorkspace = Readonly<{
  csrfToken: string;
  snapshots: readonly CatalogueIntakeSnapshot[];
  effectiveSnapshotId?: string;
  queue: readonly CatalogueIntakeQueueItem[];
  selected?: CatalogueIntakeDetail;
}>;

export async function adminCatalogueIntakeWorkspace(principal: SessionPrincipal, input: CatalogueIntakeFilters = {}): Promise<AdminCatalogueIntakeWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return { csrfToken: principal.csrfToken, snapshots: [], queue: [] };

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const snapshots = await readSnapshots(tx);
    const requestedSnapshot = input.snapshotId?.trim();
    const effectiveSnapshotId = requestedSnapshot && snapshots.some((snapshot) => snapshot.id === requestedSnapshot)
      ? requestedSnapshot
      : snapshots[0]?.id;
    const queue = effectiveSnapshotId
      ? await readQueue(tx, { ...input, snapshotId: effectiveSnapshotId })
      : [];
    const selectedId = input.productId?.trim() || queue[0]?.id;
    const selected = selectedId && effectiveSnapshotId
      ? await readDetail(tx, selectedId, effectiveSnapshotId)
      : undefined;
    return { csrfToken: principal.csrfToken, snapshots, effectiveSnapshotId, queue, selected };
  }, { readOnly: true, statementTimeoutMs: 8_000 });
}

async function readSnapshots(tx: SqlExecutor): Promise<readonly CatalogueIntakeSnapshot[]> {
  const result = await tx.query<SqlRow>(`
    WITH product_counts AS (
      SELECT snapshot_id,
             count(*)::integer AS product_count,
             count(*) FILTER (WHERE price_state='matched')::integer AS price_matched,
             count(*) FILTER (WHERE price_state='unpriced')::integer AS price_unpriced,
             count(*) FILTER (WHERE price_state='conflict')::integer AS price_conflict,
             count(*) FILTER (WHERE price_state='review_required')::integer AS price_review_required,
             count(*) FILTER (WHERE classification_status='review_required')::integer AS classification_review_required
      FROM catalog_source_products
      GROUP BY snapshot_id
    ), attribute_counts AS (
      SELECT sp.snapshot_id,
             count(a.id) FILTER (WHERE a.mapping_status='unmapped')::integer AS unmapped_attributes
      FROM catalog_source_products sp
      LEFT JOIN catalog_source_attribute_observations a ON a.source_product_id=sp.id
      GROUP BY sp.snapshot_id
    ), compatibility_counts AS (
      SELECT sp.snapshot_id,
             count(c.id) FILTER (WHERE c.review_status='candidate')::integer AS candidate_compatibility
      FROM catalog_source_products sp
      LEFT JOIN product_compatibility_claims c ON c.source_product_id=sp.id
      GROUP BY sp.snapshot_id
    ), link_counts AS (
      SELECT sp.snapshot_id,
             count(l.id) FILTER (WHERE l.link_status='candidate')::integer AS candidate_links
      FROM catalog_source_products sp
      LEFT JOIN catalog_source_product_links l ON l.source_product_id=sp.id
      GROUP BY sp.snapshot_id
    ), category_counts AS (
      SELECT sp.snapshot_id,
             count(DISTINCT m.id) FILTER (WHERE m.mapping_status='candidate')::integer AS candidate_category_mappings,
             count(DISTINCT m.id) FILTER (WHERE m.mapping_status='approved')::integer AS approved_category_mappings
      FROM catalog_source_products sp
      LEFT JOIN catalog_source_category_mappings m ON m.source_taxonomy_node_id=sp.source_taxonomy_node_id
      GROUP BY sp.snapshot_id
    )
    SELECT ss.id::text AS snapshot_id, s.id::text AS source_id, s.code AS source_code, s.name AS source_name,
           ss.source_filename, ss.source_hash, ss.source_version, ss.observed_at, ss.created_at, ss.row_count,
           COALESCE(pc.product_count,0) AS product_count,
           COALESCE(pc.price_matched,0) AS price_matched,
           COALESCE(pc.price_unpriced,0) AS price_unpriced,
           COALESCE(pc.price_conflict,0) AS price_conflict,
           COALESCE(pc.price_review_required,0) AS price_review_required,
           COALESCE(pc.classification_review_required,0) AS classification_review_required,
           COALESCE(ac.unmapped_attributes,0) AS unmapped_attributes,
           COALESCE(cc.candidate_compatibility,0) AS candidate_compatibility,
           COALESCE(lc.candidate_links,0) AS candidate_links,
           COALESCE(tc.candidate_category_mappings,0) AS candidate_category_mappings,
           COALESCE(tc.approved_category_mappings,0) AS approved_category_mappings
    FROM catalog_source_snapshots ss
    JOIN catalog_sources s ON s.id=ss.source_id
    LEFT JOIN product_counts pc ON pc.snapshot_id=ss.id
    LEFT JOIN attribute_counts ac ON ac.snapshot_id=ss.id
    LEFT JOIN compatibility_counts cc ON cc.snapshot_id=ss.id
    LEFT JOIN link_counts lc ON lc.snapshot_id=ss.id
    LEFT JOIN category_counts tc ON tc.snapshot_id=ss.id
    ORDER BY ss.created_at DESC, ss.id DESC
    LIMIT 30
  `);
  return result.rows.map((row) => ({
    id: stringField(row.snapshot_id),
    sourceId: stringField(row.source_id),
    sourceCode: stringField(row.source_code),
    sourceName: stringField(row.source_name),
    sourceFilename: optionalString(row.source_filename),
    sourceHash: stringField(row.source_hash),
    sourceVersion: optionalString(row.source_version),
    observedAt: optionalEpoch(row.observed_at),
    createdAt: epoch(row.created_at),
    declaredRowCount: optionalNumber(row.row_count),
    productCount: numberField(row.product_count),
    priceMatched: numberField(row.price_matched),
    priceUnpriced: numberField(row.price_unpriced),
    priceConflict: numberField(row.price_conflict),
    priceReviewRequired: numberField(row.price_review_required),
    classificationReviewRequired: numberField(row.classification_review_required),
    unmappedAttributes: numberField(row.unmapped_attributes),
    candidateCompatibility: numberField(row.candidate_compatibility),
    candidateLinks: numberField(row.candidate_links),
    candidateCategoryMappings: numberField(row.candidate_category_mappings),
    approvedCategoryMappings: numberField(row.approved_category_mappings)
  }));
}

async function readQueue(tx: SqlExecutor, input: CatalogueIntakeFilters & { snapshotId: string }): Promise<readonly CatalogueIntakeQueueItem[]> {
  const query = input.q?.trim() || null;
  const result = await tx.query<SqlRow>(`
    WITH attr AS (
      SELECT source_product_id,
             count(*) FILTER (WHERE mapping_status='unmapped')::integer AS unmapped_attributes
      FROM catalog_source_attribute_observations GROUP BY source_product_id
    ), compat AS (
      SELECT source_product_id,
             count(*) FILTER (WHERE review_status='candidate')::integer AS candidate_compatibility
      FROM product_compatibility_claims GROUP BY source_product_id
    ), links AS (
      SELECT source_product_id,
             count(*) FILTER (WHERE link_status='candidate')::integer AS candidate_links
      FROM catalog_source_product_links GROUP BY source_product_id
    ), cats AS (
      SELECT source_taxonomy_node_id,
             count(*) FILTER (WHERE mapping_status='candidate')::integer AS category_candidates,
             count(*) FILTER (WHERE mapping_status='approved')::integer AS category_approved
      FROM catalog_source_category_mappings GROUP BY source_taxonomy_node_id
    ), prices AS (
      SELECT source_product_id, count(*)::integer AS price_observations
      FROM catalog_price_observations GROUP BY source_product_id
    )
    SELECT sp.id::text AS id, sp.source_product_key, sp.supplier_code, sp.title,
           sp.source_identity, sp.normalized_payload, sp.price_state, sp.classification_status, sp.source_url,
           COALESCE(t.path_labels, ARRAY[]::text[]) AS taxonomy_path,
           COALESCE(a.unmapped_attributes,0) AS unmapped_attributes,
           COALESCE(c.candidate_compatibility,0) AS candidate_compatibility,
           COALESCE(l.candidate_links,0) AS candidate_links,
           COALESCE(cm.category_candidates,0) AS category_candidates,
           COALESCE(cm.category_approved,0) AS category_approved,
           COALESCE(p.price_observations,0) AS price_observations
    FROM catalog_source_products sp
    LEFT JOIN catalog_source_taxonomy_nodes t ON t.id=sp.source_taxonomy_node_id
    LEFT JOIN attr a ON a.source_product_id=sp.id
    LEFT JOIN compat c ON c.source_product_id=sp.id
    LEFT JOIN links l ON l.source_product_id=sp.id
    LEFT JOIN cats cm ON cm.source_taxonomy_node_id=sp.source_taxonomy_node_id
    LEFT JOIN prices p ON p.source_product_id=sp.id
    WHERE sp.snapshot_id=$1::uuid
      AND ($2::text IS NULL OR sp.title ILIKE '%' || $2 || '%' OR COALESCE(sp.supplier_code,'') ILIKE '%' || $2 || '%' OR sp.source_product_key ILIKE '%' || $2 || '%' OR COALESCE(sp.source_identity->>'brand','') ILIKE '%' || $2 || '%' OR COALESCE(sp.source_identity->>'model','') ILIKE '%' || $2 || '%')
      AND ($3::text IS NULL OR sp.price_state=$3)
      AND ($4::text IS NULL OR sp.classification_status=$4)
    ORDER BY
      CASE sp.price_state WHEN 'conflict' THEN 4 WHEN 'review_required' THEN 3 WHEN 'unpriced' THEN 2 ELSE 1 END DESC,
      (sp.classification_status='review_required') DESC,
      COALESCE(a.unmapped_attributes,0) DESC,
      COALESCE(c.candidate_compatibility,0) DESC,
      COALESCE(l.candidate_links,0) DESC,
      sp.title, sp.id
    LIMIT 120
  `, [input.snapshotId, query, input.priceState?.trim() || null, input.classificationStatus?.trim() || null]);
  return result.rows.map(mapQueueRow);
}

async function readDetail(tx: SqlExecutor, productId: string, snapshotId: string): Promise<CatalogueIntakeDetail | undefined> {
  const productResult = await tx.query<SqlRow>(`
    WITH attr AS (
      SELECT source_product_id, count(*) FILTER (WHERE mapping_status='unmapped')::integer AS unmapped_attributes
      FROM catalog_source_attribute_observations GROUP BY source_product_id
    ), compat AS (
      SELECT source_product_id, count(*) FILTER (WHERE review_status='candidate')::integer AS candidate_compatibility
      FROM product_compatibility_claims GROUP BY source_product_id
    ), links AS (
      SELECT source_product_id, count(*) FILTER (WHERE link_status='candidate')::integer AS candidate_links
      FROM catalog_source_product_links GROUP BY source_product_id
    ), cats AS (
      SELECT source_taxonomy_node_id,
             count(*) FILTER (WHERE mapping_status='candidate')::integer AS category_candidates,
             count(*) FILTER (WHERE mapping_status='approved')::integer AS category_approved
      FROM catalog_source_category_mappings GROUP BY source_taxonomy_node_id
    ), prices AS (
      SELECT source_product_id, count(*)::integer AS price_observations
      FROM catalog_price_observations GROUP BY source_product_id
    )
    SELECT sp.id::text AS id, sp.source_product_key, sp.supplier_code, sp.title, sp.source_url,
           sp.source_identity, sp.normalized_payload, sp.quality_payload, sp.price_state, sp.classification_status,
           COALESCE(t.path_labels, ARRAY[]::text[]) AS taxonomy_path,
           s.name AS source_name, ss.source_filename, ss.source_hash,
           COALESCE(a.unmapped_attributes,0) AS unmapped_attributes,
           COALESCE(c.candidate_compatibility,0) AS candidate_compatibility,
           COALESCE(l.candidate_links,0) AS candidate_links,
           COALESCE(cm.category_candidates,0) AS category_candidates,
           COALESCE(cm.category_approved,0) AS category_approved,
           COALESCE(p.price_observations,0) AS price_observations
    FROM catalog_source_products sp
    JOIN catalog_source_snapshots ss ON ss.id=sp.snapshot_id
    JOIN catalog_sources s ON s.id=sp.source_id
    LEFT JOIN catalog_source_taxonomy_nodes t ON t.id=sp.source_taxonomy_node_id
    LEFT JOIN attr a ON a.source_product_id=sp.id
    LEFT JOIN compat c ON c.source_product_id=sp.id
    LEFT JOIN links l ON l.source_product_id=sp.id
    LEFT JOIN cats cm ON cm.source_taxonomy_node_id=sp.source_taxonomy_node_id
    LEFT JOIN prices p ON p.source_product_id=sp.id
    WHERE sp.id=$1::uuid AND sp.snapshot_id=$2::uuid
    LIMIT 1
  `, [productId, snapshotId]);
  if (productResult.rowCount === 0) return undefined;
  const row = productResult.rows[0];
  const base = mapQueueRow(row);
  const sourceIdentity = jsonObject(row.source_identity);

  const pricesResult = await tx.query<SqlRow>(`
    SELECT amount_minor, currency, price_kind, observation_status, confidence, match_method, source_reference, observed_at
    FROM catalog_price_observations WHERE source_product_id=$1::uuid
    ORDER BY observed_at DESC NULLS LAST, created_at DESC, id
  `, [productId]);
  const attributesResult = await tx.query<SqlRow>(`
    SELECT a.source_attribute_key, d.code AS attribute_code, a.mapping_status, a.source_unit,
           a.raw_value, a.normalized_value, a.confidence
    FROM catalog_source_attribute_observations a
    LEFT JOIN attribute_definitions d ON d.id=a.attribute_id
    WHERE a.source_product_id=$1::uuid
    ORDER BY CASE a.mapping_status WHEN 'review_required' THEN 1 WHEN 'unmapped' THEN 2 ELSE 3 END,
             a.source_attribute_key, a.position
    LIMIT 300
  `, [productId]);
  const compatibilityResult = await tx.query<SqlRow>(`
    SELECT c.target_kind, c.target_reference, p.name AS platform_name, c.relationship_type,
           c.evidence_level, c.review_status, c.confidence, c.source_reference
    FROM product_compatibility_claims c
    LEFT JOIN compatibility_platforms p ON p.id=c.target_platform_id
    WHERE c.source_product_id=$1::uuid
    ORDER BY CASE c.review_status WHEN 'candidate' THEN 1 WHEN 'verified' THEN 2 ELSE 3 END,
             c.evidence_level, c.id
    LIMIT 200
  `, [productId]);
  const linksResult = await tx.query<SqlRow>(`
    SELECT canonical_variant_id::text AS canonical_variant_id, link_status, match_method, confidence
    FROM catalog_source_product_links WHERE source_product_id=$1::uuid
    ORDER BY CASE link_status WHEN 'candidate' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, confidence DESC NULLS LAST, id
    LIMIT 100
  `, [productId]);
  const categoriesResult = await tx.query<SqlRow>(`
    SELECT c.code AS category_code, m.mapping_status, m.mapping_method, m.confidence, m.reason
    FROM catalog_source_products sp
    JOIN catalog_source_category_mappings m ON m.source_taxonomy_node_id=sp.source_taxonomy_node_id
    JOIN categories c ON c.id=m.category_id
    WHERE sp.id=$1::uuid
    ORDER BY CASE m.mapping_status WHEN 'candidate' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, m.confidence DESC NULLS LAST, c.code
  `, [productId]);

  return {
    product: {
      ...base,
      sourceName: stringField(row.source_name),
      sourceFilename: optionalString(row.source_filename),
      sourceHash: stringField(row.source_hash),
      gtinCandidate: optionalString(sourceIdentity.gtinCandidate),
      gtinStatus: optionalString(sourceIdentity.gtinStatus),
      normalizedPayload: jsonObject(row.normalized_payload),
      qualityPayload: jsonObject(row.quality_payload)
    },
    prices: pricesResult.rows.map((item) => ({
      amountMinor: numberField(item.amount_minor),
      currency: stringField(item.currency),
      kind: stringField(item.price_kind),
      status: stringField(item.observation_status),
      confidence: optionalDecimal(item.confidence),
      matchMethod: optionalString(item.match_method),
      sourceReference: optionalString(item.source_reference),
      observedAt: optionalEpoch(item.observed_at)
    })),
    attributes: attributesResult.rows.map((item) => ({
      sourceKey: stringField(item.source_attribute_key),
      attributeCode: optionalString(item.attribute_code),
      mappingStatus: stringField(item.mapping_status),
      sourceUnit: optionalString(item.source_unit),
      rawValue: item.raw_value,
      normalizedValue: item.normalized_value ?? undefined,
      confidence: optionalDecimal(item.confidence)
    })),
    compatibility: compatibilityResult.rows.map((item) => ({
      targetKind: stringField(item.target_kind),
      targetReference: optionalString(item.target_reference),
      platformName: optionalString(item.platform_name),
      relationshipType: stringField(item.relationship_type),
      evidenceLevel: stringField(item.evidence_level),
      reviewStatus: stringField(item.review_status),
      confidence: decimalField(item.confidence),
      sourceReference: optionalString(item.source_reference)
    })),
    links: linksResult.rows.map((item) => ({
      canonicalVariantId: stringField(item.canonical_variant_id),
      linkStatus: stringField(item.link_status),
      matchMethod: stringField(item.match_method),
      confidence: optionalDecimal(item.confidence)
    })),
    categoryMappings: categoriesResult.rows.map((item) => ({
      categoryCode: stringField(item.category_code),
      mappingStatus: stringField(item.mapping_status),
      mappingMethod: stringField(item.mapping_method),
      confidence: optionalDecimal(item.confidence),
      reason: optionalString(item.reason)
    }))
  };
}

function mapQueueRow(row: SqlRow): CatalogueIntakeQueueItem {
  const sourceIdentity = jsonObject(row.source_identity);
  const normalized = jsonObject(row.normalized_payload);
  const item = {
    id: stringField(row.id),
    sourceProductKey: stringField(row.source_product_key),
    supplierCode: optionalString(row.supplier_code),
    title: stringField(row.title),
    brand: optionalString(sourceIdentity.brand),
    model: optionalString(sourceIdentity.model),
    priceState: stringField(row.price_state),
    classificationStatus: stringField(row.classification_status),
    sourceUrl: optionalString(row.source_url),
    taxonomyPath: textArray(row.taxonomy_path),
    appCategoryCode: optionalString(normalized.appCategoryCode),
    unmappedAttributes: numberField(row.unmapped_attributes),
    candidateCompatibility: numberField(row.candidate_compatibility),
    candidateLinks: numberField(row.candidate_links),
    categoryCandidates: numberField(row.category_candidates),
    categoryApproved: numberField(row.category_approved),
    priceObservations: numberField(row.price_observations)
  };
  return { ...item, reviewReasons: reviewReasons(item) };
}

function reviewReasons(item: Omit<CatalogueIntakeQueueItem, "reviewReasons">): string[] {
  const reasons: string[] = [];
  if (item.priceState === "conflict") reasons.push("price conflict");
  else if (item.priceState === "review_required") reasons.push("price evidence review");
  else if (item.priceState === "unpriced") reasons.push("unpriced source row");
  if (item.classificationStatus === "review_required" || item.classificationStatus === "raw") reasons.push("classification review");
  if (item.categoryApproved === 0 && item.categoryCandidates > 0) reasons.push("category mapping candidate");
  if (item.categoryApproved === 0 && item.categoryCandidates === 0) reasons.push("no category mapping");
  if (item.unmappedAttributes > 0) reasons.push(`${item.unmappedAttributes} unmapped attributes`);
  if (item.candidateCompatibility > 0) reasons.push(`${item.candidateCompatibility} compatibility candidates`);
  if (item.candidateLinks > 0) reasons.push(`${item.candidateLinks} canonical candidates`);
  return reasons;
}

function stringField(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Expected non-empty database string");
  return value;
}
function optionalString(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function numberField(value: unknown): number { const parsed = typeof value === "number" ? value : Number(value ?? 0); if (!Number.isSafeInteger(parsed)) throw new Error("Expected database integer"); return parsed; }
function optionalNumber(value: unknown): number | undefined { if (value == null) return undefined; return numberField(value); }
function decimalField(value: unknown): number { const parsed = typeof value === "number" ? value : Number(value); if (!Number.isFinite(parsed)) throw new Error("Expected database decimal"); return parsed; }
function optionalDecimal(value: unknown): number | undefined { return value == null ? undefined : decimalField(value); }
function epoch(value: unknown): number { const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); if (!Number.isFinite(parsed)) throw new Error("Expected database timestamp"); return parsed; }
function optionalEpoch(value: unknown): number | undefined { return value == null ? undefined : epoch(value); }
function textArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
  return {};
}
