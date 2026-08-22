import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

let pgModule: any;
try {
  pgModule = await import("pg");
} catch {
  throw new Error("PostgreSQL driver 'pg' is not installed. Install workspace dependencies before running db:seed:research.");
}
const Pool = pgModule.Pool ?? pgModule.default?.Pool;
if (!Pool) throw new Error("Unable to load pg.Pool");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = join(root, "db", "seeds", "0002_sparta_research_vendors.sql.gz");
const sql = gunzipSync(await readFile(seedPath)).toString("utf8");
const expectedSourceHash = "9b1b2da511fff5669b73366b87ba604bd0143e62acc40652c558785e13fec052";
if (!sql.includes(`-- SHA-256: ${expectedSourceHash}`)) throw new Error("Research seed source hash is missing or unexpected");

const pool = new Pool({ connectionString, max: 1, application_name: "buy-local-sparta-research-seed" });
try {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('buy_local_sparta_research_seed'))");
    try {
      await client.query(sql);
      const result = await client.query(`
        SELECT
          (SELECT count(*)::integer FROM vendor_businesses WHERE public_id LIKE 'vendor_research_%') AS vendors,
          (SELECT count(*)::integer FROM vendor_locations WHERE public_id LIKE 'location_research_%') AS locations,
          (SELECT count(*)::integer FROM vendor_verification_checks WHERE type IN (
            'merchant_census_2026_08','online_store_active_2026_08',
            'gemi_public_record_candidate_2026_08','eshop_health_audit_2026_08'
          )) AS evidence,
          (SELECT count(*)::integer FROM categories c JOIN markets m ON m.id=c.market_id WHERE m.code='sparta') AS categories
      `);
      console.log(JSON.stringify({ sourceSha256: expectedSourceHash, ...result.rows[0] }, null, 2));
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    }
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext('buy_local_sparta_research_seed'))"); } catch {}
    client.release();
  }
} finally {
  await pool.end();
}
