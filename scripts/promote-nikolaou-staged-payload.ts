import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  analyzeNikolaouRows,
  assertNikolaouHeaders,
  parseCsv
} from "./catalogue/nikolaou-import-lib.ts";

const CONTRACT = Object.freeze({
  sourceCode: "nikolaou-tools",
  sourceFilename: "nikolaou-all-products-pricing-MASTER-v2026-08-22.csv",
  importerVersion: "nikolaou-master-v2",
  expectedSourceSha256: "cd1fd865445190b0b008e42e91515584ebdf16d8430b61fbf64a50d6a54d5087",
  expectedCompressedSha256: "036659754afe49d29b97fffc4d472d00a885d6db67831cb99c0fb223285be765",
  expectedCompressedBytes: 681_683,
  expectedRows: 3_165,
  expectedTaxonomyNodes: 421,
  expectedAttributes: 5_976,
  expectedPriceObservations: 2_728,
  expectedCompatibilityClaims: 825
});

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const IMPORTER_PATH = fileURLToPath(new URL("./import-nikolaou-master.ts", import.meta.url));
const payloadId = option("--payload-id");
if (!payloadId || !/^[0-9a-f-]{36}$/i.test(payloadId)) {
  throw new Error("Usage: promote-nikolaou-staged-payload.ts --payload-id=<uuid>");
}

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!connectionString) throw new Error("DATABASE_URL or POSTGRES_URL is required");

let pgModule: any;
try { pgModule = await import("pg"); } catch { throw new Error("PostgreSQL driver 'pg' is required"); }
const Pool = pgModule.Pool ?? pgModule.default?.Pool;
if (!Pool) throw new Error("Unable to load pg.Pool");

const pool = new Pool({ connectionString, max: 1, application_name: "buy-local-sparta-nikolaou-promotion" });
let tempDirectory = "";
try {
  const evidence = await readAndVerifyReadyPayload(pool, payloadId);
  tempDirectory = await mkdtemp(join(tmpdir(), "nikolaou-promotion-"));
  const csvPath = join(tempDirectory, CONTRACT.sourceFilename);
  await writeFile(csvPath, evidence.source);

  const importer = await runImporter(csvPath);
  const finalized = await finalizeImportedPayload(pool, payloadId);

  console.log(JSON.stringify({
    status: "imported",
    payloadId,
    sourceSha256: evidence.sourceSha256,
    compressedSha256: evidence.compressedSha256,
    rowCount: evidence.analysis.rowCount,
    snapshotId: finalized.snapshotId,
    products: finalized.products,
    attributes: finalized.attributes,
    priceObservations: finalized.priceObservations,
    compatibilityClaims: finalized.compatibilityClaims,
    importerOutput: importer
  }, null, 2));
} finally {
  if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
  await pool.end();
}

async function readAndVerifyReadyPayload(pool: any, id: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('buy_local_sparta_nikolaou_promotion'))");
    await client.query("SET LOCAL ROLE bls_platform_runtime");
    const result = await client.query(`
      SELECT id::text,source_code,source_filename,importer_version,compression,status,
             expected_source_sha256,expected_compressed_sha256,expected_row_count,
             compressed_size,payload
      FROM catalog_source_import_payloads
      WHERE id=$1::uuid
      FOR UPDATE
    `, [id]);
    const row = required(result.rows[0], "catalogue source payload");
    assertContract(row);
    if (String(row.status) === "imported") {
      throw new Error("Payload is already imported; no promotion is required");
    }
    if (String(row.status) !== "ready") throw new Error(`Payload must be ready before promotion; current status is ${row.status}`);
    if (!Buffer.isBuffer(row.payload)) throw new Error("Ready payload bytes are missing");

    const compressed = Buffer.from(row.payload);
    if (compressed.length !== CONTRACT.expectedCompressedBytes) throw new Error(`Compressed size mismatch: ${compressed.length}`);
    const compressedSha256 = sha256(compressed);
    if (compressedSha256 !== CONTRACT.expectedCompressedSha256) throw new Error(`Compressed SHA-256 mismatch: ${compressedSha256}`);

    let source: Buffer;
    try { source = gunzipSync(compressed, { maxOutputLength: MAX_SOURCE_BYTES }); }
    catch (error) { throw new Error(`Unable to safely gunzip staged source: ${error instanceof Error ? error.message : String(error)}`); }
    if (source.length > MAX_SOURCE_BYTES) throw new Error("Decompressed source exceeds safety limit");
    const sourceSha256 = sha256(source);
    if (sourceSha256 !== CONTRACT.expectedSourceSha256) throw new Error(`Source SHA-256 mismatch: ${sourceSha256}`);

    const parsed = parseCsv(source.toString("utf8"));
    assertNikolaouHeaders(parsed.headers);
    const analysis = analyzeNikolaouRows(parsed.rows);
    if (analysis.duplicateSourceKeys.length) throw new Error(`Duplicate source product keys: ${analysis.duplicateSourceKeys.slice(0, 20).join(", ")}`);
    if (analysis.rowCount !== CONTRACT.expectedRows) throw new Error(`Row count mismatch: ${analysis.rowCount}`);
    if (analysis.sourceTaxonomyNodes !== CONTRACT.expectedTaxonomyNodes) throw new Error(`Taxonomy node analysis mismatch: ${analysis.sourceTaxonomyNodes}`);

    await client.query("COMMIT");
    return { source, compressedSha256, sourceSha256, analysis };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

async function runImporter(csvPath: string): Promise<unknown> {
  const args = [
    "--experimental-strip-types",
    IMPORTER_PATH,
    csvPath,
    "--apply",
    `--expected-row-count=${CONTRACT.expectedRows}`
  ];
  const { code, stdout, stderr } = await spawnAndCapture(process.execPath, args);
  if (code !== 0) throw new Error(`Nikolaou importer failed (${code}): ${stderr || stdout}`);
  const text = stdout.trim();
  if (!text) return { status: "completed_without_stdout" };
  try { return JSON.parse(text); } catch { return { status: "completed", stdout: text.slice(-8_000) }; }
}

async function finalizeImportedPayload(pool: any, id: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('buy_local_sparta_nikolaou_promotion'))");
    await client.query("SET LOCAL ROLE bls_platform_runtime");
    const payloadResult = await client.query(`
      SELECT status,source_code,source_filename,importer_version,expected_source_sha256,
             expected_compressed_sha256,expected_row_count,compressed_size,payload
      FROM catalog_source_import_payloads
      WHERE id=$1::uuid
      FOR UPDATE
    `, [id]);
    const payload = required(payloadResult.rows[0], "catalogue source payload");
    assertContract(payload);
    if (String(payload.status) === "imported") {
      const already = await client.query("SELECT imported_snapshot_id::text AS snapshot_id FROM catalog_source_import_payloads WHERE id=$1::uuid", [id]);
      await client.query("COMMIT");
      return { snapshotId: String(already.rows[0]?.snapshot_id ?? ""), products: CONTRACT.expectedRows, attributes: CONTRACT.expectedAttributes, priceObservations: CONTRACT.expectedPriceObservations, compatibilityClaims: CONTRACT.expectedCompatibilityClaims };
    }
    if (String(payload.status) !== "ready") throw new Error(`Payload changed state during promotion: ${payload.status}`);

    const snapshotResult = await client.query(`
      SELECT css.id::text,css.row_count,css.metadata
      FROM catalog_source_snapshots css
      JOIN catalog_sources cs ON cs.id=css.source_id
      JOIN markets m ON m.id=cs.market_id
      WHERE cs.code=$1 AND m.code='sparta' AND css.source_hash=$2
      ORDER BY css.created_at DESC
      LIMIT 1
      FOR UPDATE OF css
    `, [CONTRACT.sourceCode, CONTRACT.expectedSourceSha256]);
    const snapshot = required(snapshotResult.rows[0], "imported Nikolaou snapshot");
    const metadata = snapshot.metadata as Record<string, unknown> | undefined;
    if (Number(snapshot.row_count) !== CONTRACT.expectedRows) throw new Error(`Snapshot row count mismatch: ${snapshot.row_count}`);
    if (metadata?.importerVersion !== CONTRACT.importerVersion) throw new Error(`Snapshot importer mismatch: ${String(metadata?.importerVersion ?? "missing")}`);
    const snapshotId = String(snapshot.id);

    const counts = await client.query(`
      SELECT
        (SELECT count(*)::int FROM catalog_source_products WHERE snapshot_id=$1::uuid) AS products,
        (SELECT count(*)::int FROM catalog_source_attribute_observations a JOIN catalog_source_products p ON p.id=a.source_product_id WHERE p.snapshot_id=$1::uuid) AS attributes,
        (SELECT count(*)::int FROM catalog_price_observations o JOIN catalog_source_products p ON p.id=o.source_product_id WHERE p.snapshot_id=$1::uuid) AS price_observations,
        (SELECT count(*)::int FROM product_compatibility_claims c JOIN catalog_source_products p ON p.id=c.source_product_id WHERE p.snapshot_id=$1::uuid) AS compatibility_claims
    `, [snapshotId]);
    const count = required(counts.rows[0], "snapshot evidence counts");
    const products = Number(count.products);
    const attributes = Number(count.attributes);
    const priceObservations = Number(count.price_observations);
    const compatibilityClaims = Number(count.compatibility_claims);
    assertCount("products", products, CONTRACT.expectedRows);
    assertCount("attributes", attributes, CONTRACT.expectedAttributes);
    assertCount("price observations", priceObservations, CONTRACT.expectedPriceObservations);
    assertCount("compatibility claims", compatibilityClaims, CONTRACT.expectedCompatibilityClaims);

    await client.query("SELECT bls_private.complete_catalog_source_import_payload($1::uuid,$2::uuid)", [id, snapshotId]);
    const completed = await client.query("SELECT status,octet_length(payload) AS payload_bytes,imported_snapshot_id::text FROM catalog_source_import_payloads WHERE id=$1::uuid", [id]);
    const finalRow = required(completed.rows[0], "completed source payload");
    if (String(finalRow.status) !== "imported" || finalRow.payload_bytes !== null || String(finalRow.imported_snapshot_id) !== snapshotId) {
      throw new Error("Catalogue source payload completion invariant failed");
    }
    await client.query("COMMIT");
    return { snapshotId, products, attributes, priceObservations, compatibilityClaims };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

function assertContract(row: Record<string, unknown>) {
  if (String(row.source_code) !== CONTRACT.sourceCode) throw new Error("Unexpected source code");
  if (String(row.source_filename) !== CONTRACT.sourceFilename) throw new Error("Unexpected source filename");
  if (String(row.importer_version) !== CONTRACT.importerVersion) throw new Error("Unexpected importer version");
  if ("compression" in row && String(row.compression) !== "gzip") throw new Error("Unexpected payload compression");
  if (String(row.expected_source_sha256) !== CONTRACT.expectedSourceSha256) throw new Error("Unexpected expected source hash");
  if (String(row.expected_compressed_sha256) !== CONTRACT.expectedCompressedSha256) throw new Error("Unexpected expected compressed hash");
  if (Number(row.expected_row_count) !== CONTRACT.expectedRows) throw new Error("Unexpected expected row count");
  if (row.compressed_size != null && Number(row.compressed_size) !== CONTRACT.expectedCompressedBytes) throw new Error("Unexpected sealed compressed size");
}

function assertCount(label: string, actual: number, expected: number) {
  if (actual !== expected) throw new Error(`${label} count mismatch: ${actual}; expected ${expected}`);
}

function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function required<T>(value: T | undefined | null, label: string): T { if (value === undefined || value === null) throw new Error(`Missing ${label}`); return value; }
function option(name: string): string | undefined { const prefix = `${name}=`; return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length); }

function spawnAndCapture(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 250_000) stdout = stdout.slice(-250_000); });
    child.stderr.on("data", (chunk) => { stderr += chunk; if (stderr.length > 250_000) stderr = stderr.slice(-250_000); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}
