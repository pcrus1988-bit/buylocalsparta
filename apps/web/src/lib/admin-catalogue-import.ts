import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import {
  analyzeNikolaouRows,
  assertNikolaouHeaders,
  parseCsv
} from "../../../../scripts/catalogue/nikolaou-import-lib";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export const NIKOLAOU_CURRENT_IMPORT_CONTRACT = Object.freeze({
  sourceCode: "nikolaou-tools",
  sourceFilename: "nikolaou-all-products-pricing-MASTER-v2026-08-22.csv",
  importerVersion: "nikolaou-master-v2",
  expectedSourceSha256: "cd1fd865445190b0b008e42e91515584ebdf16d8430b61fbf64a50d6a54d5087",
  expectedCompressedSha256: "036659754afe49d29b97fffc4d472d00a885d6db67831cb99c0fb223285be765",
  expectedRowCount: 3165,
  expectedCompressedBytes: 681_683
});

export const NIKOLAOU_IMPORT_LIMITS = Object.freeze({
  maxCompressedBytes: 2 * 1024 * 1024,
  maxSourceBytes: 15 * 1024 * 1024
});

export type CatalogueImportPayloadView = Readonly<{
  id: string;
  sourceCode: string;
  sourceFilename: string;
  importerVersion: string;
  expectedSourceSha256: string;
  expectedCompressedSha256: string;
  expectedRowCount: number;
  status: string;
  stagedBytes: number;
  compressedSize?: number;
  sealedAt?: number;
  importedAt?: number;
  importedSnapshotId?: string;
  failureReason?: string;
  createdAt: number;
  updatedAt: number;
}>;

export type AdminCatalogueImportWorkspace = Readonly<{
  csrfToken: string;
  contract: typeof NIKOLAOU_CURRENT_IMPORT_CONTRACT;
  limits: typeof NIKOLAOU_IMPORT_LIMITS;
  payloads: readonly CatalogueImportPayloadView[];
}>;

export type StageNikolaouResult = Readonly<{
  status: "ready" | "already_ready" | "already_imported";
  payloadId: string;
  compressedSize: number;
  compressedSha256: string;
  sourceSha256: string;
  rowCount: number;
  taxonomyNodes: number;
  priceConflict: number;
  priceReviewRequired: number;
  unpriced: number;
}>;

export async function adminCatalogueImportWorkspace(principal: SessionPrincipal): Promise<AdminCatalogueImportWorkspace> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) {
    return { csrfToken: principal.csrfToken, contract: NIKOLAOU_CURRENT_IMPORT_CONTRACT, limits: NIKOLAOU_IMPORT_LIMITS, payloads: [] };
  }
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => ({
    csrfToken: principal.csrfToken,
    contract: NIKOLAOU_CURRENT_IMPORT_CONTRACT,
    limits: NIKOLAOU_IMPORT_LIMITS,
    payloads: await readPayloads(tx)
  }), { readOnly: true, statementTimeoutMs: 8_000 });
}

export async function adminStageNikolaouGzip(
  principal: SessionPrincipal,
  input: { uploadedFilename: string; compressed: Uint8Array }
): Promise<StageNikolaouResult> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Catalogue source import requires PostgreSQL runtime");

  const uploadedFilename = input.uploadedFilename.trim().slice(0, 255) || "upload.gz";
  const compressed = Buffer.from(input.compressed);
  if (compressed.length === 0) throw new Error("Uploaded gzip is empty");
  if (compressed.length > NIKOLAOU_IMPORT_LIMITS.maxCompressedBytes) throw new Error("Uploaded gzip exceeds the 2 MB import limit");

  const compressedSha256 = sha256(compressed);
  if (compressedSha256 !== NIKOLAOU_CURRENT_IMPORT_CONTRACT.expectedCompressedSha256) {
    throw new Error(`Compressed SHA-256 mismatch: ${compressedSha256}`);
  }
  if (compressed.length !== NIKOLAOU_CURRENT_IMPORT_CONTRACT.expectedCompressedBytes) {
    throw new Error(`Compressed byte length is ${compressed.length}; expected ${NIKOLAOU_CURRENT_IMPORT_CONTRACT.expectedCompressedBytes}`);
  }

  let source: Buffer;
  try {
    source = gunzipSync(compressed, { maxOutputLength: NIKOLAOU_IMPORT_LIMITS.maxSourceBytes });
  } catch (error) {
    throw new Error(`Unable to safely gunzip supplier master: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (source.length > NIKOLAOU_IMPORT_LIMITS.maxSourceBytes) throw new Error("Decompressed supplier master exceeds the 15 MB safety limit");
  const sourceSha256 = sha256(source);
  if (sourceSha256 !== NIKOLAOU_CURRENT_IMPORT_CONTRACT.expectedSourceSha256) {
    throw new Error(`Source SHA-256 mismatch: ${sourceSha256}`);
  }

  const parsed = parseCsv(source.toString("utf8"));
  assertNikolaouHeaders(parsed.headers);
  const analysis = analyzeNikolaouRows(parsed.rows);
  if (analysis.duplicateSourceKeys.length) throw new Error(`Duplicate source product keys: ${analysis.duplicateSourceKeys.slice(0, 20).join(", ")}`);
  if (analysis.rowCount !== NIKOLAOU_CURRENT_IMPORT_CONTRACT.expectedRowCount) {
    throw new Error(`Master row count is ${analysis.rowCount}; expected ${NIKOLAOU_CURRENT_IMPORT_CONTRACT.expectedRowCount}`);
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 4_000 });
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('catalog_source_payload_upload:nikolaou-tools'))");

    const existing = await tx.query<SqlRow>(`
      SELECT id::text,status,source_filename,expected_compressed_sha256,expected_row_count,
             COALESCE(octet_length(payload),0)::integer AS staged_bytes,
             COALESCE(compressed_size,0)::integer AS compressed_size,
             imported_snapshot_id::text
      FROM catalog_source_import_payloads
      WHERE source_code=$1 AND expected_source_sha256=$2 AND importer_version=$3
      FOR UPDATE
    `, [NIKOLAOU_CURRENT_IMPORT_CONTRACT.sourceCode, sourceSha256, NIKOLAOU_CURRENT_IMPORT_CONTRACT.importerVersion]);

    const current = existing.rows[0];
    if (current) {
      if (String(current.source_filename) !== NIKOLAOU_CURRENT_IMPORT_CONTRACT.sourceFilename) throw new Error("Existing staging payload filename does not match the immutable import contract");
      if (String(current.expected_compressed_sha256) !== compressedSha256) throw new Error("Existing staging payload compressed hash does not match the immutable import contract");
      if (Number(current.expected_row_count) !== analysis.rowCount) throw new Error("Existing staging payload row count does not match the immutable import contract");
      const status = String(current.status);
      const payloadId = String(current.id);
      if (status === "imported") return statusResult("already_imported", payloadId, Number(current.compressed_size) || compressed.length, compressedSha256, sourceSha256, analysis);
      if (status === "ready") return statusResult("already_ready", payloadId, Number(current.compressed_size) || compressed.length, compressedSha256, sourceSha256, analysis);
      if (status === "rejected") throw new Error("The matching source payload is terminal/rejected; create a new governed source version instead of mutating it");
      if (status !== "staging") throw new Error(`Unsupported source payload status: ${status}`);

      await tx.query(`
        UPDATE catalog_source_import_payloads
        SET payload=$2, metadata=metadata || $3::jsonb
        WHERE id=$1::uuid AND status='staging'
      `, [payloadId, compressed, JSON.stringify({ uploadedFilename, uploadedBy: principal.userId, uploadMode: "admin_gzip", sourceBytes: source.length })]);
      const sealed = await sealPayload(tx, payloadId);
      return statusResult("ready", payloadId, sealed.compressedSize, sealed.compressedSha256, sourceSha256, analysis);
    }

    const inserted = await tx.query<SqlRow>(`
      INSERT INTO catalog_source_import_payloads(
        source_code,source_filename,importer_version,compression,
        expected_source_sha256,expected_compressed_sha256,expected_row_count,payload,metadata
      ) VALUES ($1,$2,$3,'gzip',$4,$5,$6,$7,$8::jsonb)
      RETURNING id::text
    `, [
      NIKOLAOU_CURRENT_IMPORT_CONTRACT.sourceCode,
      NIKOLAOU_CURRENT_IMPORT_CONTRACT.sourceFilename,
      NIKOLAOU_CURRENT_IMPORT_CONTRACT.importerVersion,
      sourceSha256,
      compressedSha256,
      analysis.rowCount,
      compressed,
      JSON.stringify({ uploadedFilename, uploadedBy: principal.userId, uploadMode: "admin_gzip", sourceBytes: source.length })
    ]);
    const payloadId = String(inserted.rows[0]?.id ?? "");
    if (!payloadId) throw new Error("Catalogue source payload insert did not return an id");
    const sealed = await sealPayload(tx, payloadId);
    return statusResult("ready", payloadId, sealed.compressedSize, sealed.compressedSha256, sourceSha256, analysis);
  }, { readOnly: false, statementTimeoutMs: 20_000 });

  await recordAdminAudit(
    principal,
    result.status === "ready" ? "catalogue.source_payload.staged" : "catalogue.source_payload.reused",
    "catalog_source_import_payload",
    result.payloadId,
    "Nikolaou supplier master gzip verified and checksum-sealed",
    {
      status: result.status,
      sourceCode: NIKOLAOU_CURRENT_IMPORT_CONTRACT.sourceCode,
      importerVersion: NIKOLAOU_CURRENT_IMPORT_CONTRACT.importerVersion,
      sourceSha256: result.sourceSha256,
      compressedSha256: result.compressedSha256,
      compressedSize: result.compressedSize,
      rowCount: result.rowCount
    }
  );
  return result;
}

async function sealPayload(tx: SqlExecutor, payloadId: string): Promise<{ compressedSize: number; compressedSha256: string }> {
  const sealed = await tx.query<SqlRow>(`
    SELECT payload_id::text, compressed_size::integer, compressed_sha256
    FROM bls_private.seal_catalog_source_import_payload($1::uuid)
  `, [payloadId]);
  const row = sealed.rows[0];
  if (!row) throw new Error("Catalogue source payload seal did not return evidence");
  return { compressedSize: Number(row.compressed_size), compressedSha256: String(row.compressed_sha256) };
}

function statusResult(
  status: StageNikolaouResult["status"],
  payloadId: string,
  compressedSize: number,
  compressedSha256: string,
  sourceSha256: string,
  analysis: ReturnType<typeof analyzeNikolaouRows>
): StageNikolaouResult {
  return {
    status,
    payloadId,
    compressedSize,
    compressedSha256,
    sourceSha256,
    rowCount: analysis.rowCount,
    taxonomyNodes: analysis.sourceTaxonomyNodes,
    priceConflict: analysis.conflictLegacy,
    priceReviewRequired: analysis.priceReviewRequired,
    unpriced: analysis.unpricedLegacy
  };
}

async function readPayloads(tx: SqlExecutor): Promise<readonly CatalogueImportPayloadView[]> {
  const result = await tx.query<SqlRow>(`
    SELECT id::text,source_code,source_filename,importer_version,expected_source_sha256,
           expected_compressed_sha256,expected_row_count,status,
           COALESCE(octet_length(payload),0)::integer AS staged_bytes,
           compressed_size::integer,sealed_at,imported_at,imported_snapshot_id::text,
           failure_reason,created_at,updated_at
    FROM catalog_source_import_payloads
    ORDER BY created_at DESC,id DESC
    LIMIT 20
  `);
  return result.rows.map((row) => ({
    id: String(row.id),
    sourceCode: String(row.source_code),
    sourceFilename: String(row.source_filename),
    importerVersion: String(row.importer_version),
    expectedSourceSha256: String(row.expected_source_sha256),
    expectedCompressedSha256: String(row.expected_compressed_sha256),
    expectedRowCount: Number(row.expected_row_count),
    status: String(row.status),
    stagedBytes: Number(row.staged_bytes),
    compressedSize: optionalNumber(row.compressed_size),
    sealedAt: optionalEpoch(row.sealed_at),
    importedAt: optionalEpoch(row.imported_at),
    importedSnapshotId: optionalString(row.imported_snapshot_id),
    failureReason: optionalString(row.failure_reason),
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at)
  }));
}

function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function optionalString(value: unknown): string | undefined { const normalized = String(value ?? "").trim(); return normalized || undefined; }
function optionalNumber(value: unknown): number | undefined { if (value == null || value === "") return undefined; const n = Number(value); return Number.isFinite(n) ? n : undefined; }
function epoch(value: unknown): number { const n = new Date(String(value)).getTime(); if (!Number.isFinite(n)) throw new Error("Invalid catalogue import timestamp"); return n; }
function optionalEpoch(value: unknown): number | undefined { if (value == null || value === "") return undefined; return epoch(value); }
