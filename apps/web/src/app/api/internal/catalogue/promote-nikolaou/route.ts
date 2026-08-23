import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PAYLOAD_ID = "c888d656-b566-4e2d-9e4f-f3318cdd2293";
const VAULT_SECRET_NAME = "nikolaou-promotion-trigger-20260823";
const EXPECTED_SOURCE_SHA = "cd1fd865445190b0b008e42e91515584ebdf16d8430b61fbf64a50d6a54d5087";
const EXPECTED_COMPRESSED_SHA = "036659754afe49d29b97fffc4d472d00a885d6db67831cb99c0fb223285be765";
const EXPECTED_ROWS = 3_165;

export async function POST(request: Request) {
  const suppliedToken = request.headers.get("x-promotion-token")?.trim() ?? "";
  if (!/^[0-9a-f]{64}$/i.test(suppliedToken)) return rejected();

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return Response.json({ error: "database_runtime_unavailable" }, { status: 503, headers: noStore() });

  const pool = new Pool({ connectionString, max: 1, application_name: "buy-local-sparta-nikolaou-trigger" });
  try {
    const authorized = await consumeOneShotAuthorization(pool, suppliedToken);
    if (!authorized) return rejected();

    const workerPath = resolveWorkerPath();
    const run = await runWorker(workerPath);
    if (run.code !== 0) {
      console.error(JSON.stringify({ event: "catalogue.nikolaou_promotion_failed", code: run.code, stderr: run.stderr.slice(-8_000) }));
      return Response.json({ error: "promotion_worker_failed", code: run.code, stderr: run.stderr.slice(-4_000) }, { status: 500, headers: noStore() });
    }

    let result: unknown;
    try { result = JSON.parse(run.stdout.trim()); }
    catch { result = { status: "completed", stdout: run.stdout.slice(-8_000) }; }
    return Response.json({ ok: true, result }, { headers: noStore() });
  } catch (error) {
    console.error(JSON.stringify({ event: "catalogue.nikolaou_promotion_trigger_error", message: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "promotion_trigger_failed" }, { status: 500, headers: noStore() });
  } finally {
    await pool.end();
  }
}

export function GET() {
  return new Response(null, { status: 404, headers: noStore() });
}

async function consumeOneShotAuthorization(pool: Pool, suppliedToken: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nikolaou_promotion_http_trigger'))");
    const payload = await client.query(`
      SELECT status,source_code,source_filename,importer_version,expected_source_sha256,
             expected_compressed_sha256,expected_row_count,compressed_size
      FROM catalog_source_import_payloads
      WHERE id=$1::uuid
      FOR UPDATE
    `, [PAYLOAD_ID]);
    const row = payload.rows[0];
    if (!row || String(row.status) !== "ready" || String(row.source_code) !== "nikolaou-tools" ||
        String(row.source_filename) !== "nikolaou-all-products-pricing-MASTER-v2026-08-22.csv" ||
        String(row.importer_version) !== "nikolaou-master-v2" || String(row.expected_source_sha256) !== EXPECTED_SOURCE_SHA ||
        String(row.expected_compressed_sha256) !== EXPECTED_COMPRESSED_SHA || Number(row.expected_row_count) !== EXPECTED_ROWS ||
        Number(row.compressed_size) !== 681_683) {
      await client.query("ROLLBACK");
      return false;
    }

    const secret = await client.query(`
      SELECT id::text,decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name=$1
      LIMIT 1
    `, [VAULT_SECRET_NAME]);
    const secretRow = secret.rows[0];
    const expectedToken = String(secretRow?.decrypted_secret ?? "");
    if (!secretRow?.id || !safeEqualToken(suppliedToken, expectedToken)) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query("DELETE FROM vault.secrets WHERE id=$1::uuid", [String(secretRow.id)]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function safeEqualToken(actual: string, expected: string): boolean {
  const left = createHash("sha256").update(actual).digest();
  const right = createHash("sha256").update(expected).digest();
  return actual.length === expected.length && timingSafeEqual(left, right);
}

function resolveWorkerPath(): string {
  const candidates = [
    resolve(process.cwd(), "../../scripts/promote-nikolaou-staged-payload.ts"),
    resolve(process.cwd(), "scripts/promote-nikolaou-staged-payload.ts"),
    resolve(process.cwd(), "../scripts/promote-nikolaou-staged-payload.ts")
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error("Traced Nikolaou promotion worker is unavailable");
  return path;
}

function runWorker(workerPath: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", workerPath, `--payload-id=${PAYLOAD_ID}`], {
      cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 250_000) stdout = stdout.slice(-250_000); });
    child.stderr.on("data", (chunk) => { stderr += chunk; if (stderr.length > 250_000) stderr = stderr.slice(-250_000); });
    child.on("error", reject);
    child.on("close", (code) => resolveRun({ code: code ?? -1, stdout, stderr }));
  });
}

function rejected() {
  return Response.json({ error: "not_found" }, { status: 404, headers: noStore() });
}

function noStore(): Record<string, string> {
  return { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow, noarchive" };
}
