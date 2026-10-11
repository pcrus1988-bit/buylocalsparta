/**
 * ONE-TIME PRODUCTION RELEASE REPAIR: apply existing immutable migration 0437.
 * Runs only in the Vercel production build; remove this hook after verified rollout.
 * Uses the same already-configured POSTGRES_URL as the strict production schema gate.
 * Never emits credentials, hostnames, or database row contents.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

if (process.env.VERCEL_ENV !== "production") {
  console.log("CLAIM 0437 one-time migration skipped outside Vercel production.");
} else {
  if (process.env.VERCEL_GIT_COMMIT_REF && process.env.VERCEL_GIT_COMMIT_REF !== "main") {
    throw new Error("CLAIM 0437 migration refuses non-main production build.");
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const raw = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (!raw) throw new Error("CLAIM migration requires existing production database connection.");

  const dbUrl = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(dbUrl.protocol)) {
    throw new Error("Unexpected production database protocol.");
  }
  // Match the project's existing production schema gate for Supabase-hosted Postgres.
  if (dbUrl.hostname.toLowerCase().endsWith(".supabase.co") ||
      dbUrl.hostname.toLowerCase().endsWith(".supabase.com")) {
    dbUrl.searchParams.set("sslmode", "no-verify");
  }
  const connection = dbUrl.toString();
  const pool = new pg.Pool({
    connectionString: connection,
    max: 1,
    application_name: "kontamou-claim-0437-one-time-rollout",
    connectionTimeoutMillis: 10000
  });
  const client = await pool.connect();
  try {
    // Serialize this one-time repair across concurrent Vercel production builds.
    await client.query("SELECT pg_advisory_lock(hashtext('kontamou-claim-0437-release'))");
    const expectedSha = JSON.parse(readFileSync(resolve(root, "db/migrations/checksums.0437.json"), "utf8"))[
      "0437_hub_claim_website_embed.sql"
    ];
    const state = await client.query(`
      SELECT
        (SELECT MAX(version)::integer FROM public.schema_migrations) AS head,
        (SELECT COUNT(*)::integer FROM public.schema_migrations) AS migration_count,
        (SELECT filename FROM public.schema_migrations WHERE version=437) AS filename_437,
        (SELECT TRIM(sha256) FROM public.schema_migrations WHERE version=437) AS checksum_437,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name='hub_expansion_prospects'
            AND column_name='website_embed_enabled'
        ) AS has_embed_column
    `);
    const row = state.rows[0];
    if (row.head === 437 && row.migration_count === 376 &&
        row.filename_437 === "0437_hub_claim_website_embed.sql" &&
        row.checksum_437 === expectedSha && row.has_embed_column) {
      console.log("CLAIM 0437 already applied: migration skipped.");
    } else {
      if (row.head !== 436 || row.migration_count !== 375 || row.has_embed_column || row.filename_437) {
        throw new Error("Unexpected production schema state; migration aborted without changes.");
      }
      console.log("CLAIM schema 0436 verified; applying one outstanding canonical migration.");
      // Use the production project's immutable checksum-aware migration ledger.
      // DB URL is supplied via environment, never as command-line argument.
      const stdout = execFileSync(process.execPath, ["--experimental-strip-types", "scripts/migrate.ts"], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: connection, PGSSLMODE: "require" },
        timeout: 120000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
      if (!stdout.includes("apply 0437_hub_claim_website_embed.sql")) {
        throw new Error("Migration command did not report applying schema 0437.");
      }
      const verify = await client.query(`
        SELECT m.version,m.filename,TRIM(m.sha256) AS sha256,
               EXISTS (
                 SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public'
                   AND table_name='hub_expansion_prospects'
                   AND column_name='website_embed_enabled'
               ) AS installed
        FROM public.schema_migrations m WHERE m.version=437
      `);
      const installed = verify.rows[0];
      if (!installed || installed.sha256 !== expectedSha || !installed.installed) {
        throw new Error("CLAIM 0437 read-back verification failed.");
      }
      console.log("CLAIM schema 0437 applied and verified in production.");
    }
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext('kontamou-claim-0437-release'))"); }
    finally { client.release(); await pool.end(); }
  }
}
