import { createHash } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { normalizeProductImport, type ProductImportNormalizedRow } from "./product-import-intelligence-server";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export const AI_PRODUCT_IMPORT_LIMITS = Object.freeze({
  maxUploadedBytes: 8 * 1024 * 1024,
  maxSourceBytes: 20 * 1024 * 1024,
  maxRows: 50_000
});

export type AiProductImportStageResult = Readonly<{
  status: "normalized" | "already_normalized";
  runId: string;
  profileId: string;
  profileStatus: string;
  sourceCode: string;
  sourceSha256: string;
  rowCount: number;
  readyRows: number;
  reviewRows: number;
  quarantineRows: number;
  duplicateSourceKeys: number;
  mappedCoverage: number;
  identityCoverage: number;
}>;

export type AiProductImportPromotionResult = Readonly<{
  status: "pim_staged" | "already_pim_staged";
  runId: string;
  sourceId: string;
  snapshotId: string;
  importedRows: number;
  quarantinedRows: number;
  taxonomyNodes: number;
  approvedCategoryMappings: number;
  candidateCategoryMappings: number;
  unmappedTaxonomyLeaves: number;
  attributeObservations: number;
  priceObservations: number;
  compatibilityClaims: number;
}>;

export type AiProductImportCanonicalizationResult = Readonly<{
  status: "canonicalized" | "already_canonicalized";
  runId: string;
  sourceCode: string;
  snapshotId: string;
  vendorId: string;
  locationId: string;
  result: Readonly<Record<string, unknown>>;
}>;

export async function adminStageAiProductImport(
  principal: SessionPrincipal,
  input: { sourceCode: string; sourceName: string; sourceFilename: string; sourceText: string }
): Promise<AiProductImportStageResult> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("AI product import requires PostgreSQL runtime");

  const sourceCode = normalizeSourceCode(input.sourceCode);
  const sourceName = clean(input.sourceName).slice(0, 200);
  const sourceFilename = clean(input.sourceFilename).slice(0, 255) || "products.csv";
  if (!sourceName) throw new Error("Source name is required");
  if (!input.sourceText.trim()) throw new Error("Product import file is empty");

  const normalized = normalizeProductImport(input.sourceText, sourceFilename);
  if (normalized.analysis.rowCount > AI_PRODUCT_IMPORT_LIMITS.maxRows) throw new Error("Product import row count exceeds the governed limit");
  const counts = triageCounts(normalized.rows);
  const profileStatus = normalized.analysis.readiness.criticalIssues.length === 0 && normalized.analysis.ambiguousColumns.length === 0
    ? "approved"
    : "candidate";

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 30_000, lockTimeoutMs: 4_000 });
  const persisted = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    await tx.query("SET LOCAL ROLE bls_platform_runtime");
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ai_product_import:${sourceCode}:${normalized.analysis.sourceSha256}`]);

    const market = await tx.query<SqlRow>("SELECT id::text FROM markets WHERE code='sparta' LIMIT 1");
    const marketId = requiredString(market.rows[0]?.id, "Sparta market is missing");
    const delimiter = normalized.analysis.delimiter === "\t" ? "tab" : normalized.analysis.delimiter;
    const profile = await tx.query<SqlRow>(`
      INSERT INTO catalog_import_mapping_profiles(
        market_id,source_code,profile_key,engine_version,normalizer_version,delimiter,
        headers,mappings,unmapped_columns,ambiguous_columns,mapped_coverage,identity_coverage,
        status,created_by,reviewed_by,reviewed_at,metadata,updated_at
      ) VALUES(
        $1::uuid,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,
        $13,$14::uuid,CASE WHEN $13='approved' THEN $14::uuid ELSE NULL END,
        CASE WHEN $13='approved' THEN now() ELSE NULL END,$15::jsonb,now()
      )
      ON CONFLICT (market_id,source_code,profile_key) DO UPDATE SET
        mappings=EXCLUDED.mappings,
        unmapped_columns=EXCLUDED.unmapped_columns,
        ambiguous_columns=EXCLUDED.ambiguous_columns,
        mapped_coverage=EXCLUDED.mapped_coverage,
        identity_coverage=EXCLUDED.identity_coverage,
        status=CASE
          WHEN catalog_import_mapping_profiles.status IN ('rejected','superseded') THEN catalog_import_mapping_profiles.status
          ELSE EXCLUDED.status
        END,
        reviewed_by=COALESCE(catalog_import_mapping_profiles.reviewed_by,EXCLUDED.reviewed_by),
        reviewed_at=COALESCE(catalog_import_mapping_profiles.reviewed_at,EXCLUDED.reviewed_at),
        metadata=catalog_import_mapping_profiles.metadata || EXCLUDED.metadata,
        updated_at=now()
      RETURNING id::text,status
    `, [
      marketId, sourceCode, normalized.profileKey, normalized.analysis.engineVersion, normalized.normalizerVersion,
      delimiter, JSON.stringify(normalized.analysis.headers), JSON.stringify(normalized.analysis.mappings),
      JSON.stringify(normalized.analysis.unmappedColumns), JSON.stringify(normalized.analysis.ambiguousColumns),
      normalized.analysis.readiness.mappedCoverage, normalized.analysis.readiness.identityCoverage,
      profileStatus, principal.userId,
      JSON.stringify({ sourceFilename, inference: "product_intelligence_v1", automaticWriteScope: "normalization_only" })
    ]);
    const profileId = requiredString(profile.rows[0]?.id, "Mapping profile insert did not return an id");
    const storedProfileStatus = String(profile.rows[0]?.status ?? profileStatus);

    const existing = await tx.query<SqlRow>(`
      SELECT id::text,status,profile_id::text,ready_rows,review_rows,quarantine_rows,duplicate_source_key_count
      FROM catalog_import_runs
      WHERE market_id=$1::uuid AND source_code=$2 AND source_sha256=$3 AND normalizer_version=$4
      LIMIT 1
    `, [marketId, sourceCode, normalized.analysis.sourceSha256, normalized.normalizerVersion]);
    if (existing.rowCount) {
      const row = existing.rows[0];
      return {
        status: "already_normalized" as const,
        runId: String(row.id),
        profileId: String(row.profile_id),
        profileStatus: storedProfileStatus
      };
    }

    const run = await tx.query<SqlRow>(`
      INSERT INTO catalog_import_runs(
        market_id,source_code,source_name,source_filename,source_sha256,engine_version,normalizer_version,
        profile_id,status,row_count,ready_rows,review_rows,quarantine_rows,duplicate_source_key_count,analysis,created_by
      ) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8::uuid,'normalized',$9,$10,$11,$12,$13,$14::jsonb,$15::uuid)
      RETURNING id::text
    `, [
      marketId, sourceCode, sourceName, sourceFilename, normalized.analysis.sourceSha256,
      normalized.analysis.engineVersion, normalized.normalizerVersion, profileId, normalized.analysis.rowCount,
      counts.ready, counts.review, counts.quarantine, normalized.duplicateSourceKeys.length,
      JSON.stringify({
        delimiter,
        headers: normalized.analysis.headers,
        mappings: normalized.analysis.mappings,
        unmappedColumns: normalized.analysis.unmappedColumns,
        ambiguousColumns: normalized.analysis.ambiguousColumns,
        readiness: normalized.analysis.readiness,
        profileKey: normalized.profileKey,
        duplicateSourceKeys: normalized.duplicateSourceKeys
      }),
      principal.userId
    ]);
    const runId = requiredString(run.rows[0]?.id, "AI product import run insert did not return an id");

    for (const batch of chunks(normalized.rows, 180)) {
      const params: unknown[] = [];
      const values = batch.map((row) => {
        const o = params.length;
        params.push(
          runId, row.rowNumber, row.sourceKey, row.identityConfidence, row.triageStatus, row.reasons,
          JSON.stringify(row.normalized), JSON.stringify(row.raw)
        );
        return `($${o + 1}::uuid,$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6}::text[],$${o + 7}::jsonb,$${o + 8}::jsonb)`;
      });
      await tx.query(`
        INSERT INTO catalog_import_row_decisions(
          run_id,row_number,source_key,identity_confidence,triage_status,reasons,normalized_payload,raw_payload
        ) VALUES ${values.join(",")}
      `, params);
    }

    return { status: "normalized" as const, runId, profileId, profileStatus: storedProfileStatus };
  }, { readOnly: false, statementTimeoutMs: 30_000 });

  await recordAdminAudit(principal, "catalogue.ai_import.normalized", "catalog_import_run", persisted.runId,
    "Generic supplier product file normalized into a private governed import run", {
      sourceCode,
      sourceFilename,
      sourceSha256: normalized.analysis.sourceSha256,
      rowCount: normalized.analysis.rowCount,
      readyRows: counts.ready,
      reviewRows: counts.review,
      quarantineRows: counts.quarantine,
      duplicateSourceKeys: normalized.duplicateSourceKeys.length,
      profileId: persisted.profileId,
      profileStatus: persisted.profileStatus
    });

  return {
    ...persisted,
    sourceCode,
    sourceSha256: normalized.analysis.sourceSha256,
    rowCount: normalized.analysis.rowCount,
    readyRows: counts.ready,
    reviewRows: counts.review,
    quarantineRows: counts.quarantine,
    duplicateSourceKeys: normalized.duplicateSourceKeys.length,
    mappedCoverage: normalized.analysis.readiness.mappedCoverage,
    identityCoverage: normalized.analysis.readiness.identityCoverage
  };
}

export async function adminPromoteAiProductImportRun(
  principal: SessionPrincipal,
  input: { runId: string }
): Promise<AiProductImportPromotionResult> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("AI product import requires PostgreSQL runtime");
  const runId = requireUuid(input.runId, "runId");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 45_000, lockTimeoutMs: 5_000 });
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    await tx.query("SET LOCAL ROLE bls_platform_runtime");
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ai_product_import_promote:${runId}`]);
    const run = await readRun(tx, runId, true);
    if (run.source_snapshot_id) return priorPromotionResult(tx, run, true);
    if (String(run.status) === "rejected") throw new Error("Rejected AI product import runs cannot be promoted");

    const rowResult = await tx.query<SqlRow>(`
      SELECT row_number,source_key,identity_confidence,triage_status,reasons,normalized_payload,raw_payload
      FROM catalog_import_row_decisions WHERE run_id=$1::uuid ORDER BY row_number
    `, [runId]);
    const allRows = rowResult.rows.map(storedRow);
    const duplicateKeys = new Set<string>();
    const sourceKeyCounts = new Map<string, number>();
    for (const row of allRows) sourceKeyCounts.set(row.sourceKey, (sourceKeyCounts.get(row.sourceKey) ?? 0) + 1);
    for (const [key, count] of sourceKeyCounts) if (count > 1) duplicateKeys.add(key);
    const admitted = allRows.filter((row) => row.triageStatus !== "quarantine" && !duplicateKeys.has(row.sourceKey) && clean(row.normalized.title));
    if (!admitted.length) throw new Error("No non-quarantined, identity-unique product rows are available for PIM staging");

    const source = await tx.query<SqlRow>(`
      INSERT INTO catalog_sources(market_id,code,name,source_kind,default_currency,active,metadata)
      VALUES($1::uuid,$2,$3,'supplier','EUR',true,$4::jsonb)
      ON CONFLICT (market_id,code) DO UPDATE SET
        name=EXCLUDED.name,active=true,metadata=catalog_sources.metadata || EXCLUDED.metadata,updated_at=now()
      RETURNING id::text
    `, [String(run.market_id), String(run.source_code), String(run.source_name), JSON.stringify({ genericAiImporter: true, engineVersion: run.engine_version, normalizerVersion: run.normalizer_version })]);
    const sourceId = requiredString(source.rows[0]?.id, "Catalogue source insert did not return an id");

    const existingSnapshot = await tx.query<SqlRow>(`
      SELECT id::text FROM catalog_source_snapshots WHERE source_id=$1::uuid AND source_hash=$2 LIMIT 1
    `, [sourceId, String(run.source_sha256)]);
    if (existingSnapshot.rowCount) {
      const snapshotId = String(existingSnapshot.rows[0].id);
      await tx.query("UPDATE catalog_import_runs SET source_snapshot_id=$2::uuid,status='pim_staged',updated_at=now() WHERE id=$1::uuid", [runId, snapshotId]);
      const refreshed = await readRun(tx, runId, false);
      return priorPromotionResult(tx, refreshed, true);
    }

    const snapshot = await tx.query<SqlRow>(`
      INSERT INTO catalog_source_snapshots(source_id,source_filename,source_hash,source_version,row_count,metadata)
      VALUES($1::uuid,$2,$3,$4,$5,$6::jsonb) RETURNING id::text
    `, [sourceId, String(run.source_filename), String(run.source_sha256), String(run.normalizer_version), admitted.length,
      JSON.stringify({ importRunId: runId, originalRowCount: Number(run.row_count), quarantinedRows: allRows.length - admitted.length, engineVersion: run.engine_version })]);
    const snapshotId = requiredString(snapshot.rows[0]?.id, "Catalogue snapshot insert did not return an id");

    const taxonomy = collectTaxonomy(admitted, String(run.source_code));
    const nodeIdByKey = new Map<string, string>();
    for (const node of [...taxonomy.nodes].sort((a, b) => a.path.length - b.path.length || a.key.localeCompare(b.key))) {
      const parentKey = node.path.length > 1 ? taxonomyKey(String(run.source_code), node.path.slice(0, -1)) : undefined;
      const inserted = await tx.query<SqlRow>(`
        INSERT INTO catalog_source_taxonomy_nodes(source_id,parent_id,source_key,source_label,depth,path_labels,path_keys,active,metadata)
        VALUES($1::uuid,$2::uuid,$3,$4,$5,$6::text[],$7::text[],true,$8::jsonb)
        ON CONFLICT (source_id,source_key) DO UPDATE SET
          parent_id=EXCLUDED.parent_id,source_label=EXCLUDED.source_label,depth=EXCLUDED.depth,
          path_labels=EXCLUDED.path_labels,path_keys=EXCLUDED.path_keys,active=true,metadata=catalog_source_taxonomy_nodes.metadata || EXCLUDED.metadata,updated_at=now()
        RETURNING id::text
      `, [sourceId, parentKey ? nodeIdByKey.get(parentKey) ?? null : null, node.key, node.path.at(-1), node.path.length - 1,
        node.path, node.path.map((_, index) => taxonomyKey(String(run.source_code), node.path.slice(0, index + 1))), JSON.stringify({ importRunId: runId })]);
      nodeIdByKey.set(node.key, requiredString(inserted.rows[0]?.id, "Taxonomy node insert did not return an id"));
    }

    for (const [leafKey, count] of taxonomy.leafCounts) {
      await tx.query(`
        INSERT INTO catalog_source_taxonomy_observations(snapshot_id,source_taxonomy_node_id,product_count,metadata)
        VALUES($1::uuid,$2::uuid,$3,$4::jsonb)
      `, [snapshotId, requiredString(nodeIdByKey.get(leafKey), "Missing taxonomy leaf id"), count, JSON.stringify({ importRunId: runId })]);
    }

    const categories = await categoryCandidates(tx, String(run.market_id));
    let approvedCategoryMappings = 0;
    let candidateCategoryMappings = 0;
    let unmappedTaxonomyLeaves = 0;
    const mappingByLeaf = new Map<string, { categoryId: string; status: "approved" | "candidate"; confidence: number; reason: string }>();
    for (const [leafKey, path] of taxonomy.leafPaths) {
      const match = matchCategory(path, categories);
      if (!match) { unmappedTaxonomyLeaves += 1; continue; }
      const leafId = requiredString(nodeIdByKey.get(leafKey), "Missing taxonomy leaf id");
      await tx.query(`
        INSERT INTO catalog_source_category_mappings(
          source_taxonomy_node_id,category_id,mapping_status,mapping_method,confidence,reason,reviewed_by,reviewed_at,metadata
        ) VALUES($1::uuid,$2::uuid,$3,'enrichment',$4,$5,$6::uuid,CASE WHEN $3='approved' THEN now() ELSE NULL END,$7::jsonb)
        ON CONFLICT DO NOTHING
      `, [leafId, match.categoryId, match.status, match.confidence, match.reason, principal.userId, JSON.stringify({ importRunId: runId, genericAiImporter: true })]);
      mappingByLeaf.set(leafKey, match);
      if (match.status === "approved") approvedCategoryMappings += 1;
      else candidateCategoryMappings += 1;
    }

    const productIdByKey = new Map<string, string>();
    for (const batch of chunks(admitted, 120)) {
      const params: unknown[] = [];
      const values = batch.map((row) => {
        const path = normalizedCategoryPath(row.normalized.categoryPath);
        const leafKey = taxonomyKey(String(run.source_code), path);
        const leafId = requiredString(nodeIdByKey.get(leafKey), "Missing product taxonomy leaf id");
        const mapped = mappingByLeaf.has(leafKey);
        const o = params.length;
        params.push(
          snapshotId, sourceId, leafId, row.sourceKey, row.normalized.supplierCode ?? null, row.normalized.title,
          row.normalized.sourceUrl ?? null, row.normalized.imageUrl ?? null,
          JSON.stringify({
            supplierCode: row.normalized.supplierCode,
            gtinCandidate: row.normalized.gtin,
            gtinStatus: row.normalized.gtin ? "verified_valid" : undefined,
            brand: row.normalized.brand,
            model: row.normalized.model
          }),
          JSON.stringify(row.raw), JSON.stringify(row.normalized),
          JSON.stringify({ importRunId: runId, triageStatus: row.triageStatus, identityConfidence: row.identityConfidence, reasons: row.reasons }),
          row.normalized.priceMinor === undefined ? "unpriced" : "matched",
          mapped ? "mapped" : "review_required"
        );
        return `($${o + 1}::uuid,$${o + 2}::uuid,$${o + 3}::uuid,$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9}::jsonb,$${o + 10}::jsonb,$${o + 11}::jsonb,$${o + 12}::jsonb,$${o + 13},$${o + 14})`;
      });
      const inserted = await tx.query<SqlRow>(`
        INSERT INTO catalog_source_products(
          snapshot_id,source_id,source_taxonomy_node_id,source_product_key,supplier_code,title,source_url,source_image_url,
          source_identity,raw_payload,normalized_payload,quality_payload,price_state,classification_status
        ) VALUES ${values.join(",")} RETURNING id::text,source_product_key
      `, params);
      for (const row of inserted.rows) productIdByKey.set(String(row.source_product_key), String(row.id));
    }

    const attributeDefinitions = await tx.query<SqlRow>("SELECT id::text,code,unit FROM attribute_definitions");
    const attributeByCode = new Map(attributeDefinitions.rows.map((row) => [String(row.code), { id: String(row.id), unit: row.unit ? String(row.unit) : undefined }]));
    const attributeRecords: Array<{ productId: string; sourceKey: string; code: string; value: unknown; kind: string }> = [];
    const priceRecords: Array<{ productId: string; amountMinor: number; currency: string; sourceReference?: string }> = [];
    const compatibilityRecords: Array<{ productId: string; target: string; sourceReference?: string }> = [];
    for (const row of admitted) {
      const productId = requiredString(productIdByKey.get(row.sourceKey), `Missing source product id for ${row.sourceKey}`);
      for (const [code, value] of Object.entries(row.normalized.variantAttributes)) attributeRecords.push({ productId, sourceKey: `variant.${code}`, code, value, kind: "variant" });
      for (const [code, value] of Object.entries(row.normalized.specifications)) attributeRecords.push({ productId, sourceKey: `spec.${code}`, code, value, kind: "specification" });
      if (row.normalized.priceMinor !== undefined) priceRecords.push({ productId, amountMinor: row.normalized.priceMinor, currency: row.normalized.currency ?? "EUR", sourceReference: row.normalized.sourceUrl });
      for (const target of row.normalized.compatibility) compatibilityRecords.push({ productId, target, sourceReference: row.normalized.sourceUrl });
    }

    for (const batch of chunks(attributeRecords, 300)) {
      const params: unknown[] = [];
      const values = batch.map((record) => {
        const definition = attributeByCode.get(record.code);
        const o = params.length;
        params.push(record.productId, record.sourceKey, definition?.id ?? null, JSON.stringify(record.value), JSON.stringify(record.value), definition?.unit ?? null, definition ? "mapped" : "unmapped", definition ? 0.99 : null, JSON.stringify({ importRunId: runId, evidenceKind: record.kind }));
        return `($${o + 1}::uuid,$${o + 2},0,$${o + 3}::uuid,$${o + 4}::jsonb,$${o + 5}::jsonb,$${o + 6},$${o + 7},$${o + 8},$${o + 9}::jsonb)`;
      });
      await tx.query(`
        INSERT INTO catalog_source_attribute_observations(
          source_product_id,source_attribute_key,position,attribute_id,raw_value,normalized_value,source_unit,mapping_status,confidence,metadata
        ) VALUES ${values.join(",")}
      `, params);
    }

    for (const batch of chunks(priceRecords, 300)) {
      const params: unknown[] = [];
      const values = batch.map((record) => {
        const o = params.length;
        params.push(record.productId, record.amountMinor, record.currency, record.sourceReference ?? null, JSON.stringify({ importRunId: runId, genericAiImporter: true }));
        return `($${o + 1}::uuid,$${o + 2},$${o + 3},true,'catalogue','observed','import',0.95000,$${o + 4},now(),$${o + 5}::jsonb)`;
      });
      await tx.query(`
        INSERT INTO catalog_price_observations(
          source_product_id,amount_minor,currency,tax_inclusive,price_kind,observation_status,match_method,confidence,source_reference,observed_at,metadata
        ) VALUES ${values.join(",")}
      `, params);
    }

    for (const batch of chunks(compatibilityRecords, 250)) {
      const params: unknown[] = [];
      const values = batch.map((record) => {
        const o = params.length;
        params.push(record.productId, record.target, record.sourceReference ?? null, JSON.stringify({ importRunId: runId, genericAiImporter: true }));
        return `($${o + 1}::uuid,'external_model',$${o + 2},'compatible_with','heuristic','candidate',0.75000,$${o + 3},$${o + 4}::jsonb)`;
      });
      await tx.query(`
        INSERT INTO product_compatibility_claims(
          source_product_id,target_kind,target_reference,relationship_type,evidence_level,review_status,confidence,source_reference,evidence
        ) VALUES ${values.join(",")}
      `, params);
    }

    const promotionResult: AiProductImportPromotionResult = {
      status: "pim_staged",
      runId,
      sourceId,
      snapshotId,
      importedRows: admitted.length,
      quarantinedRows: allRows.length - admitted.length,
      taxonomyNodes: taxonomy.nodes.length,
      approvedCategoryMappings,
      candidateCategoryMappings,
      unmappedTaxonomyLeaves,
      attributeObservations: attributeRecords.length,
      priceObservations: priceRecords.length,
      compatibilityClaims: compatibilityRecords.length
    };
    await tx.query(`
      UPDATE catalog_import_runs SET status='pim_staged',source_snapshot_id=$2::uuid,analysis=analysis || $3::jsonb,updated_at=now()
      WHERE id=$1::uuid
    `, [runId, snapshotId, JSON.stringify({ promotion: promotionResult })]);
    return promotionResult;
  }, { readOnly: false, statementTimeoutMs: 45_000 });

  await recordAdminAudit(principal, "catalogue.ai_import.pim_staged", "catalog_import_run", runId,
    "Normalized AI product import rows promoted into immutable supplier PIM evidence", result);
  return result;
}

export async function adminCanonicalizeAiProductImportRun(
  principal: SessionPrincipal,
  input: { runId: string; vendorId: string; locationId: string }
): Promise<AiProductImportCanonicalizationResult> {
  assertAdminPermission(principal, "catalog.write");
  assertAdminPermission(principal, "vendor.manage");
  if (!postgresAdminRuntimeEnabled()) throw new Error("AI product import requires PostgreSQL runtime");
  const runId = requireUuid(input.runId, "runId");
  const vendorRef = clean(input.vendorId);
  const locationRef = clean(input.locationId);
  if (!vendorRef || !locationRef) throw new Error("Vendor and location are required for catalogue assignment");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 60_000, lockTimeoutMs: 6_000 });
  const output = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    await tx.query("SET LOCAL ROLE bls_platform_runtime");
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ai_product_import_canonicalize:${runId}`]);
    const run = await readRun(tx, runId, true);
    const snapshotId = requiredString(run.source_snapshot_id, "AI product import must be promoted to PIM before canonicalization");
    const sourceCode = String(run.source_code);

    if (String(run.status) === "canonicalized" && run.canonicalization_result) {
      return {
        status: "already_canonicalized" as const,
        runId,
        sourceCode,
        snapshotId,
        vendorId: String(run.target_vendor_id ?? vendorRef),
        locationId: String(run.target_location_id ?? locationRef),
        result: jsonObject(run.canonicalization_result)
      };
    }

    const vendor = await tx.query<SqlRow>(`
      SELECT id::text,public_id FROM vendor_businesses
      WHERE market_id=$1::uuid AND (id::text=$2 OR public_id=$2) LIMIT 1
    `, [String(run.market_id), vendorRef]);
    const vendorId = requiredString(vendor.rows[0]?.id, "Vendor not found in import market");
    const location = await tx.query<SqlRow>(`
      SELECT id::text,public_id FROM vendor_locations
      WHERE vendor_id=$1::uuid AND market_id=$2::uuid AND active=true AND (id::text=$3 OR public_id=$3) LIMIT 1
    `, [vendorId, String(run.market_id), locationRef]);
    const locationId = requiredString(location.rows[0]?.id, "Active vendor location not found in import market");

    const applied = await tx.query<SqlRow>(`
      SELECT bls_private.apply_catalog_source_canonicalization($1,$2::uuid,$3::uuid,$4::uuid,0.95,2400) AS result
    `, [sourceCode, vendorId, locationId, snapshotId]);
    const result = jsonObject(applied.rows[0]?.result);
    await tx.query(`
      UPDATE catalog_import_runs
      SET status='canonicalized',target_vendor_id=$2::uuid,target_location_id=$3::uuid,
          canonicalization_result=$4::jsonb,updated_at=now()
      WHERE id=$1::uuid
    `, [runId, vendorId, locationId, JSON.stringify(result)]);

    return { status: "canonicalized" as const, runId, sourceCode, snapshotId, vendorId, locationId, result };
  }, { readOnly: false, statementTimeoutMs: 60_000 });

  await recordAdminAudit(principal, "catalogue.ai_import.canonicalized", "catalog_import_run", runId,
    "High-confidence PIM rows processed through governed canonicalization and candidate vendor assortment assignment", {
      sourceCode: output.sourceCode,
      snapshotId: output.snapshotId,
      vendorId: output.vendorId,
      locationId: output.locationId,
      result: output.result
    });
  return output;
}

type StoredRow = Readonly<{
  rowNumber: number;
  sourceKey: string;
  identityConfidence: number;
  triageStatus: ProductImportNormalizedRow["triageStatus"];
  reasons: readonly string[];
  normalized: ProductImportNormalizedRow["normalized"];
  raw: Readonly<Record<string, string>>;
}>;

type CategoryCandidate = Readonly<{ id: string; code: string; slug: string; names: readonly string[] }>;

async function readRun(tx: SqlExecutor, runId: string, forUpdate: boolean): Promise<SqlRow> {
  const result = await tx.query<SqlRow>(`
    SELECT id::text,market_id::text,source_code,source_name,source_filename,source_sha256,engine_version,normalizer_version,
           profile_id::text,status,row_count,source_snapshot_id::text,target_vendor_id::text,target_location_id::text,
           canonicalization_result,analysis
    FROM catalog_import_runs WHERE id=$1::uuid ${forUpdate ? "FOR UPDATE" : ""}
  `, [runId]);
  if (!result.rowCount) throw new Error("AI product import run not found");
  return result.rows[0];
}

async function priorPromotionResult(tx: SqlExecutor, run: SqlRow, already: boolean): Promise<AiProductImportPromotionResult> {
  const snapshotId = requiredString(run.source_snapshot_id, "Import run snapshot is missing");
  const source = await tx.query<SqlRow>(`
    SELECT ss.source_id::text,
      (SELECT count(*)::integer FROM catalog_source_products p WHERE p.snapshot_id=ss.id) AS imported_rows,
      (SELECT count(*)::integer FROM catalog_source_taxonomy_observations o WHERE o.snapshot_id=ss.id) AS taxonomy_leaves,
      (SELECT count(*)::integer FROM catalog_source_attribute_observations a JOIN catalog_source_products p ON p.id=a.source_product_id WHERE p.snapshot_id=ss.id) AS attributes,
      (SELECT count(*)::integer FROM catalog_price_observations po JOIN catalog_source_products p ON p.id=po.source_product_id WHERE p.snapshot_id=ss.id) AS prices,
      (SELECT count(*)::integer FROM product_compatibility_claims pc JOIN catalog_source_products p ON p.id=pc.source_product_id WHERE p.snapshot_id=ss.id) AS compatibility
    FROM catalog_source_snapshots ss WHERE ss.id=$1::uuid
  `, [snapshotId]);
  const row = source.rows[0];
  if (!row) throw new Error("Import run references a missing PIM snapshot");
  const mappingCounts = await tx.query<SqlRow>(`
    SELECT
      count(*) FILTER (WHERE m.mapping_status='approved')::integer AS approved,
      count(*) FILTER (WHERE m.mapping_status='candidate')::integer AS candidate
    FROM catalog_source_taxonomy_observations o
    LEFT JOIN catalog_source_category_mappings m ON m.source_taxonomy_node_id=o.source_taxonomy_node_id
    WHERE o.snapshot_id=$1::uuid
  `, [snapshotId]);
  const counts = mappingCounts.rows[0] ?? {};
  const importedRows = Number(row.imported_rows ?? 0);
  return {
    status: already ? "already_pim_staged" : "pim_staged",
    runId: String(run.id),
    sourceId: String(row.source_id),
    snapshotId,
    importedRows,
    quarantinedRows: Math.max(0, Number(run.row_count ?? importedRows) - importedRows),
    taxonomyNodes: Number(row.taxonomy_leaves ?? 0),
    approvedCategoryMappings: Number(counts.approved ?? 0),
    candidateCategoryMappings: Number(counts.candidate ?? 0),
    unmappedTaxonomyLeaves: Math.max(0, Number(row.taxonomy_leaves ?? 0) - Number(counts.approved ?? 0) - Number(counts.candidate ?? 0)),
    attributeObservations: Number(row.attributes ?? 0),
    priceObservations: Number(row.prices ?? 0),
    compatibilityClaims: Number(row.compatibility ?? 0)
  };
}

function storedRow(row: SqlRow): StoredRow {
  return {
    rowNumber: Number(row.row_number),
    sourceKey: String(row.source_key),
    identityConfidence: Number(row.identity_confidence),
    triageStatus: String(row.triage_status) as StoredRow["triageStatus"],
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    normalized: jsonObject(row.normalized_payload) as ProductImportNormalizedRow["normalized"],
    raw: jsonObject(row.raw_payload) as Record<string, string>
  };
}

async function categoryCandidates(tx: SqlExecutor, marketId: string): Promise<readonly CategoryCandidate[]> {
  const result = await tx.query<SqlRow>(`
    SELECT c.id::text,c.code,c.slug,COALESCE(array_agg(DISTINCT ct.name) FILTER (WHERE ct.name IS NOT NULL),ARRAY[]::text[]) AS names
    FROM categories c
    LEFT JOIN category_translations ct ON ct.category_id=c.id
    WHERE c.active=true AND c.assignable=true AND (c.market_id=$1::uuid OR c.market_id IS NULL)
    GROUP BY c.id,c.code,c.slug
  `, [marketId]);
  return result.rows.map((row) => ({ id: String(row.id), code: String(row.code), slug: String(row.slug), names: Array.isArray(row.names) ? row.names.map(String) : [] }));
}

function matchCategory(path: readonly string[], candidates: readonly CategoryCandidate[]): { categoryId: string; status: "approved" | "candidate"; confidence: number; reason: string } | undefined {
  const leaf = semantic(path.at(-1) ?? "");
  const full = semantic(path.join(" "));
  if (!leaf) return undefined;
  const exactCode = candidates.filter((candidate) => [candidate.code, candidate.slug].some((value) => semantic(value) === leaf || semantic(value) === full));
  if (exactCode.length === 1) return { categoryId: exactCode[0].id, status: "approved", confidence: 1, reason: "exact canonical category code/slug" };
  const exactName = candidates.filter((candidate) => candidate.names.some((name) => semantic(name) === leaf));
  if (exactName.length === 1) return { categoryId: exactName[0].id, status: "candidate", confidence: 0.97, reason: "unique exact localized category name" };
  return undefined;
}

function collectTaxonomy(rows: readonly StoredRow[], sourceCode: string) {
  const nodesByKey = new Map<string, { key: string; path: string[] }>();
  const leafCounts = new Map<string, number>();
  const leafPaths = new Map<string, string[]>();
  for (const row of rows) {
    const path = normalizedCategoryPath(row.normalized.categoryPath);
    for (let depth = 1; depth <= path.length; depth += 1) {
      const prefix = path.slice(0, depth);
      const key = taxonomyKey(sourceCode, prefix);
      nodesByKey.set(key, { key, path: prefix });
    }
    const leafKey = taxonomyKey(sourceCode, path);
    leafCounts.set(leafKey, (leafCounts.get(leafKey) ?? 0) + 1);
    leafPaths.set(leafKey, path);
  }
  return { nodes: [...nodesByKey.values()], leafCounts, leafPaths };
}

function normalizedCategoryPath(value: readonly string[]): string[] {
  const path = value.map(clean).filter(Boolean).slice(0, 8);
  return path.length ? path : ["Uncategorized"];
}

function taxonomyKey(sourceCode: string, path: readonly string[]): string {
  return `ai:${createHash("sha256").update(`${sourceCode}|${path.map(semantic).join(">")} `).digest("hex").slice(0, 24)}`;
}

function triageCounts(rows: readonly ProductImportNormalizedRow[]) {
  let ready = 0, review = 0, quarantine = 0;
  for (const row of rows) {
    if (row.triageStatus === "ready_for_identity_matching") ready += 1;
    else if (row.triageStatus === "needs_mapping_review") review += 1;
    else quarantine += 1;
  }
  return { ready, review, quarantine };
}

function normalizeSourceCode(value: string): string {
  const code = semantic(value).replace(/\s+/g, "-").slice(0, 100);
  if (!code) throw new Error("Source code is required");
  if (!/^[a-z0-9-]+$/.test(code)) throw new Error("Source code must normalize to letters, numbers and dashes");
  return code;
}

function requireUuid(value: string, label: string): string {
  const normalized = clean(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) throw new Error(`${label} must be a UUID`);
  return normalized;
}
function requiredString(value: unknown, message: string): string { const normalized = clean(String(value ?? "")); if (!normalized) throw new Error(message); return normalized; }
function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) { try { const parsed = JSON.parse(value); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed; } catch { /* ignore */ } }
  return {};
}
function semantic(value: string): string { return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR").replace(/[_\-.]+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
function clean(value: string | undefined): string { return (value ?? "").trim().replace(/\s+/gu, " "); }
function chunks<T>(values: readonly T[], size: number): T[][] { const result: T[][] = []; for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size) as T[]); return result; }
