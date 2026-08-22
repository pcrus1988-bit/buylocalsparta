import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import {
  analyzeNikolaouRows,
  assertNikolaouHeaders,
  confidence,
  hasLegacyPrice,
  minor,
  normalizedSourceProduct,
  parseCsv,
  priceState,
  qualityPayload,
  slugCode,
  sourceProductKey,
  sourceTaxonomyKey,
  sourceTaxonomyPath,
  splitPipe,
  structuredAttributes,
  text,
  yes,
  type CsvRow
} from "./catalogue/nikolaou-import-lib.ts";

const IMPORTER_VERSION = "nikolaou-master-v1";
const args = process.argv.slice(2);
const csvPath = args.find((arg) => !arg.startsWith("--"));
if (!csvPath) throw new Error("Usage: import-nikolaou-master.ts <master.csv> [--apply] [--expected-row-count=3165] [--approve-high-confidence-taxonomy]");
const apply = args.includes("--apply");
const approveHighConfidenceTaxonomy = args.includes("--approve-high-confidence-taxonomy");
const expectedRowCount = Number(option("--expected-row-count") ?? "3165");
if (!Number.isInteger(expectedRowCount) || expectedRowCount < 0) throw new Error("--expected-row-count must be a non-negative integer");

const file = await readFile(csvPath, "utf8");
const fileHash = createHash("sha256").update(file).digest("hex");
const { headers, rows } = parseCsv(file);
assertNikolaouHeaders(headers);
const analysis = analyzeNikolaouRows(rows);
if (analysis.duplicateSourceKeys.length) throw new Error(`Duplicate source product keys: ${analysis.duplicateSourceKeys.slice(0, 20).join(", ")}`);
if (expectedRowCount > 0 && rows.length !== expectedRowCount) throw new Error(`Master row count is ${rows.length}; expected ${expectedRowCount}`);

const dryRunReport = {
  mode: apply ? "apply" : "dry-run",
  importerVersion: IMPORTER_VERSION,
  sourceFile: basename(csvPath),
  sourceSha256: fileHash,
  ...analysis
};
if (!apply) {
  console.log(JSON.stringify(dryRunReport, null, 2));
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!connectionString) throw new Error("DATABASE_URL or POSTGRES_URL is required with --apply");
let pgModule: any;
try { pgModule = await import("pg"); } catch { throw new Error("PostgreSQL driver 'pg' is required"); }
const Pool = pgModule.Pool ?? pgModule.default?.Pool;
if (!Pool) throw new Error("Unable to load pg.Pool");

const pool = new Pool({ connectionString, max: 1, application_name: "buy-local-sparta-nikolaou-import" });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('buy_local_sparta_nikolaou_import'))");
    await client.query("SET LOCAL ROLE bls_platform_runtime");

    const marketResult = await client.query("SELECT id, currency FROM markets WHERE code='sparta' LIMIT 1");
    if (!marketResult.rowCount) throw new Error("Sparta market is missing");
    const marketId = marketResult.rows[0].id as string;
    const currency = String(marketResult.rows[0].currency ?? "EUR");

    const sourceResult = await client.query(`
      INSERT INTO catalog_sources(market_id,code,name,source_kind,website,default_currency,metadata)
      VALUES ($1,'nikolaou-tools','Nikolaou Tools','supplier','https://www.nikolaoutools.gr',$2,$3::jsonb)
      ON CONFLICT (market_id,code) DO UPDATE SET
        name=EXCLUDED.name, website=EXCLUDED.website, active=true,
        metadata=catalog_sources.metadata || EXCLUDED.metadata, updated_at=now()
      RETURNING id
    `, [marketId, currency, JSON.stringify({ importerVersion: IMPORTER_VERSION })]);
    const sourceId = sourceResult.rows[0].id as string;

    const existingSnapshot = await client.query("SELECT id,row_count FROM catalog_source_snapshots WHERE source_id=$1 AND source_hash=$2", [sourceId, fileHash]);
    if (existingSnapshot.rowCount) {
      const snapshotId = existingSnapshot.rows[0].id as string;
      const productCount = await client.query("SELECT count(*)::integer AS n FROM catalog_source_products WHERE snapshot_id=$1", [snapshotId]);
      if (Number(productCount.rows[0].n) !== rows.length) throw new Error(`Existing snapshot ${snapshotId} is incomplete: ${productCount.rows[0].n}/${rows.length} products`);
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ ...dryRunReport, status: "already_imported", snapshotId, sourceId }, null, 2));
      process.exit(0);
    }

    const versions = [...new Set(rows.map((row) => text(row.master_record_version)).filter(Boolean))];
    const observedDates = rows.map((row) => text(row.last_researched_date)).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
    const observedAt = observedDates.at(-1) ? `${observedDates.at(-1)}T12:00:00+03:00` : null;
    const snapshotResult = await client.query(`
      INSERT INTO catalog_source_snapshots(source_id,source_filename,source_hash,source_version,observed_at,row_count,metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id
    `, [sourceId, basename(csvPath), fileHash, versions.join(",") || null, observedAt, rows.length, JSON.stringify({ importerVersion: IMPORTER_VERSION, analysis })]);
    const snapshotId = snapshotResult.rows[0].id as string;

    const categoryRows = await client.query(`
      SELECT id,code,assignable,taxonomy_role FROM categories
      WHERE active AND (market_id=$1 OR market_id IS NULL)
    `, [marketId]);
    const categoryByCode = new Map<string, { id: string; assignable: boolean; taxonomyRole: string }>(categoryRows.rows.map((row: any) => [String(row.code), { id: row.id, assignable: Boolean(row.assignable), taxonomyRole: String(row.taxonomy_role) }]));
    const attributeRows = await client.query("SELECT id,code,unit FROM attribute_definitions WHERE active");
    const attributeByCode = new Map<string, { id: string; unit?: string }>(attributeRows.rows.map((row: any) => [String(row.code), { id: row.id, unit: row.unit ? String(row.unit) : undefined }]));

    const taxonomyNodes = collectTaxonomyNodes(rows);
    const nodeIdByKey = new Map<string, string>();
    for (const node of taxonomyNodes.sort((a, b) => a.path.length - b.path.length || a.key.localeCompare(b.key))) {
      const parentKey = node.path.length > 1 ? sourceTaxonomyKey(node.path.slice(0, -1)) : undefined;
      const parentId = parentKey ? nodeIdByKey.get(parentKey) : undefined;
      const result = await client.query(`
        INSERT INTO catalog_source_taxonomy_nodes(source_id,parent_id,source_key,source_label,depth,path_labels,path_keys,source_url)
        VALUES ($1,$2,$3,$4,$5,$6::text[],$7::text[],$8)
        ON CONFLICT (source_id,source_key) DO UPDATE SET
          parent_id=EXCLUDED.parent_id, source_label=EXCLUDED.source_label, depth=EXCLUDED.depth,
          path_labels=EXCLUDED.path_labels, path_keys=EXCLUDED.path_keys, source_url=COALESCE(EXCLUDED.source_url,catalog_source_taxonomy_nodes.source_url), active=true, updated_at=now()
        RETURNING id
      `, [sourceId, parentId ?? null, node.key, node.path.at(-1), node.path.length - 1, node.path, node.path.map((_, index) => sourceTaxonomyKey(node.path.slice(0, index + 1))), node.sourceUrl || null]);
      nodeIdByKey.set(node.key, result.rows[0].id);
    }

    const leafCounts = new Map<string, number>();
    for (const row of rows) {
      const key = sourceTaxonomyKey(sourceTaxonomyPath(row.supplier_categories));
      leafCounts.set(key, (leafCounts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of leafCounts) {
      await client.query(`
        INSERT INTO catalog_source_taxonomy_observations(snapshot_id,source_taxonomy_node_id,product_count,metadata)
        VALUES ($1,$2,$3,$4::jsonb)
      `, [snapshotId, required(nodeIdByKey.get(key), `taxonomy node ${key}`), count, JSON.stringify({ importerVersion: IMPORTER_VERSION })]);
    }

    const taxonomyPairs = collectTaxonomyMappings(rows);
    let approvedMappings = 0;
    let candidateMappings = 0;
    const missingCategoryCodes = new Set<string>();
    for (const mapping of taxonomyPairs) {
      const category = categoryByCode.get(mapping.appCode);
      if (!category || !category.assignable) { missingCategoryCodes.add(mapping.appCode); continue; }
      const canApprove = approveHighConfidenceTaxonomy && mapping.onlyMappingForLeaf && mapping.minimumConfidence >= 0.95;
      const mappingStatus = canApprove ? "approved" : "candidate";
      await client.query(`
        INSERT INTO catalog_source_category_mappings(source_taxonomy_node_id,category_id,mapping_status,mapping_method,confidence,reason,metadata)
        SELECT $1,$2,$3,'import',$4,$5,$6::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM catalog_source_category_mappings
          WHERE source_taxonomy_node_id=$1 AND category_id=$2 AND mapping_status IN ('candidate','approved')
        )
      `, [required(nodeIdByKey.get(mapping.leafKey), `taxonomy leaf ${mapping.leafKey}`), category.id, mappingStatus, mapping.minimumConfidence, mapping.reason || null, JSON.stringify({ sourceAppCategoryCode: mapping.appCode, importerVersion: IMPORTER_VERSION })]);
      if (canApprove) approvedMappings += 1; else candidateMappings += 1;
    }

    const productRecords = rows.map((row) => {
      const appCategory = categoryByCode.get(text(row.app_category_code));
      const classificationStatus = appCategory?.assignable ? "mapped" : "review_required";
      return {
        key: sourceProductKey(row), row,
        taxonomyNodeId: required(nodeIdByKey.get(sourceTaxonomyKey(sourceTaxonomyPath(row.supplier_categories))), "product taxonomy node"),
        classificationStatus
      };
    });
    const productIdByKey = new Map<string, string>();
    for (const chunk of chunks(productRecords, 150)) {
      const params: unknown[] = [];
      const values = chunk.map((record) => {
        const row = record.row;
        const offset = params.length;
        params.push(snapshotId, sourceId, record.taxonomyNodeId, record.key, text(row.supplier_code) || null, text(row.title), text(row.source_url) || null, text(row.image_url) || null,
          JSON.stringify({ supplierCode: text(row.supplier_code), gtinCandidate: text(row.gtin13), gtinStatus: text(row.gtin13) ? "derived_candidate_unverified" : undefined, model: text(row.model), brand: text(row.brand) }),
          JSON.stringify(row), JSON.stringify(normalizedSourceProduct(row)), JSON.stringify(qualityPayload(row)), priceState(row), record.classificationStatus);
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9}::jsonb,$${offset + 10}::jsonb,$${offset + 11}::jsonb,$${offset + 12}::jsonb,$${offset + 13},$${offset + 14})`;
      });
      const result = await client.query(`
        INSERT INTO catalog_source_products(snapshot_id,source_id,source_taxonomy_node_id,source_product_key,supplier_code,title,source_url,source_image_url,source_identity,raw_payload,normalized_payload,quality_payload,price_state,classification_status)
        VALUES ${values.join(",")} RETURNING id,source_product_key
      `, params);
      for (const resultRow of result.rows) productIdByKey.set(String(resultRow.source_product_key), resultRow.id);
    }

    const attributeRecords: any[] = [];
    for (const record of productRecords) {
      const sourceProductId = required(productIdByKey.get(record.key), `source product ${record.key}`);
      for (const attribute of structuredAttributes(record.row)) {
        const definition = attributeByCode.get(attribute.attributeCode);
        attributeRecords.push({ sourceProductId, ...attribute, definition });
      }
    }
    for (const chunk of chunks(attributeRecords, 400)) {
      const params: unknown[] = [];
      const values = chunk.map((record) => {
        const offset = params.length;
        params.push(record.sourceProductId, record.sourceKey, 0, record.definition?.id ?? null, JSON.stringify(record.value), JSON.stringify(record.value), record.definition?.unit ?? null, record.definition ? "mapped" : "unmapped", record.definition ? 1 : null, JSON.stringify({ evidenceKind: record.evidenceKind, importerVersion: IMPORTER_VERSION }));
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5}::jsonb,$${offset + 6}::jsonb,$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10}::jsonb)`;
      });
      await client.query(`INSERT INTO catalog_source_attribute_observations(source_product_id,source_attribute_key,position,attribute_id,raw_value,normalized_value,source_unit,mapping_status,confidence,metadata) VALUES ${values.join(",")}`, params);
    }

    const priceRecords: any[] = [];
    for (const record of productRecords) {
      const row = record.row;
      const sourceProductId = required(productIdByKey.get(record.key), `source product ${record.key}`);
      if (hasLegacyPrice(row)) priceRecords.push(priceObservation(sourceProductId, row, "legacy"));
      if (minor(row.improved_price_candidate_minor) !== undefined) priceRecords.push(priceObservation(sourceProductId, row, "improved"));
    }
    for (const chunk of chunks(priceRecords, 350)) {
      const params: unknown[] = [];
      const values = chunk.map((record) => {
        const offset = params.length;
        params.push(record.sourceProductId, record.amountMinor, currency, true, "catalogue", record.status, record.matchMethod, record.confidence, record.sourceReference, record.observedAt, JSON.stringify(record.metadata));
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11}::jsonb)`;
      });
      await client.query(`INSERT INTO catalog_price_observations(source_product_id,amount_minor,currency,tax_inclusive,price_kind,observation_status,match_method,confidence,source_reference,observed_at,metadata) VALUES ${values.join(",")}`, params);
    }

    const platformIdByCode = new Map<string, string>();
    const platformRows = new Map<string, { code: string; name: string; brand: string; platform: string }>();
    for (const row of rows) {
      const platform = text(row.platform);
      if (!platform) continue;
      const brand = text(row.brand) || "Generic";
      const code = `${slugCode(brand)}-${slugCode(platform)}`;
      platformRows.set(code, { code, name: `${brand} ${platform}`, brand, platform });
    }
    for (const platform of platformRows.values()) {
      await client.query(`INSERT INTO compatibility_platforms(market_id,code,name,attributes) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`, [marketId, platform.code, platform.name, JSON.stringify({ source: "nikolaou-tools", brand: platform.brand, platform: platform.platform })]);
      const result = await client.query("SELECT id FROM compatibility_platforms WHERE market_id=$1 AND brand_id IS NULL AND code=$2 LIMIT 1", [marketId, platform.code]);
      platformIdByCode.set(platform.code, required(result.rows[0]?.id, `compatibility platform ${platform.code}`));
    }

    const claimRecords: any[] = [];
    for (const record of productRecords) {
      const row = record.row;
      const sourceProductId = required(productIdByKey.get(record.key), `source product ${record.key}`);
      const claimConfidence = confidence(row.compatibility_confidence, 0.5);
      const evidence = { basis: text(row.compatibility_evidence_basis), discrepancies: splitPipe(row.compatibility_discrepancy_flags), importerVersion: IMPORTER_VERSION };
      for (const target of splitPipe(row.explicit_compatible_models_all)) claimRecords.push({ sourceProductId, targetKind: "external_model", targetReference: target, targetPlatformId: null, relationshipType: "compatible_with", evidenceLevel: "explicit", claimConfidence, sourceReference: text(row.compatibility_evidence_url) || text(row.source_url) || null, evidence });
      const platform = text(row.platform);
      if (platform) {
        const code = `${slugCode(text(row.brand) || "Generic")}-${slugCode(platform)}`;
        claimRecords.push({ sourceProductId, targetKind: "platform", targetReference: null, targetPlatformId: required(platformIdByCode.get(code), `platform ${code}`), relationshipType: "uses_platform", evidenceLevel: "platform", claimConfidence, sourceReference: text(row.compatibility_evidence_url) || text(row.source_url) || null, evidence });
      }
    }
    for (const chunk of chunks(claimRecords, 350)) {
      const params: unknown[] = [];
      const values = chunk.map((record) => {
        const offset = params.length;
        params.push(record.sourceProductId, record.targetKind, record.targetPlatformId, record.targetReference, record.relationshipType, record.evidenceLevel, "candidate", record.claimConfidence, record.sourceReference, JSON.stringify(record.evidence));
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10}::jsonb)`;
      });
      await client.query(`INSERT INTO product_compatibility_claims(source_product_id,target_kind,target_platform_id,target_reference,relationship_type,evidence_level,review_status,confidence,source_reference,evidence) VALUES ${values.join(",")}`, params);
    }

    await client.query("COMMIT");
    console.log(JSON.stringify({
      ...dryRunReport,
      status: "imported",
      sourceId,
      snapshotId,
      taxonomyNodes: taxonomyNodes.length,
      taxonomyMappings: { approved: approvedMappings, candidates: candidateMappings, missingOrNonAssignableCategoryCodes: [...missingCategoryCodes].sort() },
      products: productRecords.length,
      attributes: attributeRecords.length,
      priceObservations: priceRecords.length,
      compatibilityPlatforms: platformRows.size,
      compatibilityClaims: claimRecords.length
    }, null, 2));
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
} finally { await pool.end(); }

function collectTaxonomyNodes(rows: readonly CsvRow[]) {
  const nodes = new Map<string, { key: string; path: string[]; sourceUrl: string }>();
  for (const row of rows) {
    const path = sourceTaxonomyPath(row.supplier_categories);
    for (let depth = 1; depth <= path.length; depth += 1) {
      const nodePath = path.slice(0, depth);
      const key = sourceTaxonomyKey(nodePath);
      if (!nodes.has(key)) nodes.set(key, { key, path: nodePath, sourceUrl: text(row.source_url) });
    }
  }
  return [...nodes.values()];
}

function collectTaxonomyMappings(rows: readonly CsvRow[]) {
  const pairs = new Map<string, { leafKey: string; appCode: string; confidences: number[]; reasons: Set<string> }>();
  const codesByLeaf = new Map<string, Set<string>>();
  for (const row of rows) {
    const appCode = text(row.app_category_code);
    if (!appCode) continue;
    const leafKey = sourceTaxonomyKey(sourceTaxonomyPath(row.supplier_categories));
    const pairKey = `${leafKey}\u0000${appCode}`;
    const pair = pairs.get(pairKey) ?? { leafKey, appCode, confidences: [], reasons: new Set<string>() };
    pair.confidences.push(confidence(row.taxonomy_confidence, 0.5));
    if (text(row.taxonomy_reason)) pair.reasons.add(text(row.taxonomy_reason));
    pairs.set(pairKey, pair);
    const codes = codesByLeaf.get(leafKey) ?? new Set<string>(); codes.add(appCode); codesByLeaf.set(leafKey, codes);
  }
  return [...pairs.values()].map((pair) => ({
    leafKey: pair.leafKey,
    appCode: pair.appCode,
    minimumConfidence: Math.min(...pair.confidences),
    onlyMappingForLeaf: (codesByLeaf.get(pair.leafKey)?.size ?? 0) === 1,
    reason: [...pair.reasons].join(" | ")
  }));
}

function priceObservation(sourceProductId: string, row: CsvRow, kind: "legacy" | "improved") {
  const improved = kind === "improved";
  const amountMinor = required(minor(improved ? row.improved_price_candidate_minor : row.recommended_price_minor), `${kind} price`);
  const reviewRequired = improved || yes(row.price_review_required);
  const source = text(improved ? row.improved_price_source : row.price_source);
  const page = text(improved ? row.improved_price_source_page : row.price_source_page);
  const label = text(improved ? row.improved_price_candidate_status : row.price_match_confidence);
  const date = text(row.last_researched_date);
  return {
    sourceProductId, amountMinor,
    status: reviewRequired ? "review_required" : "observed",
    matchMethod: text(improved ? row.improved_price_match_method : "legacy_master") || null,
    confidence: confidence(label, improved ? 0.65 : 0.75),
    sourceReference: [source, page].filter(Boolean).join(":") || null,
    observedAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00+03:00` : null,
    metadata: { evidenceKind: improved ? "improved_candidate" : "legacy_recommended_price", source, page, sourceStatus: label, importerVersion: IMPORTER_VERSION, vendorConfirmationRequired: true }
  };
}

function chunks<T>(values: readonly T[], size: number): T[][] { const result: T[][] = []; for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size)); return result; }
function required<T>(value: T | undefined | null, label: string): T { if (value === undefined || value === null || value === "") throw new Error(`Missing ${label}`); return value; }
function option(name: string): string | undefined { const prefix = `${name}=`; return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length); }
