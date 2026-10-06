import { join } from "node:path";
import { loadManifest, loadMigrations, migrationDirectoryFrom, verifyMigrationManifest } from "./migration-lib.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const EMPTY_CATALOGUE_ENRICHMENT_MIGRATIONS = new Set([
  308, 310, 311, 312, 313, 314, 315, 316,
  317, 318, 319, 320, 321, 322, 324,
  326, 327, 328, 329, 330, 331,
  391, 392, 393, 394, 395, 396, 397, 398, 399,
  400, 401, 402, 404, 405, 406, 407, 408, 409,
  410, 411, 412, 413
]);

const EMPTY_CATALOGUE_SCHEMA_PREFIX_MIGRATIONS = new Map<number, string>([
  [403, "CREATE TEMP TABLE _sport_403_family"]
]);

function usesLocalDatabase(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

let pgModule: any;
try {
  pgModule = await import("pg");
} catch {
  throw new Error("PostgreSQL driver 'pg' is not installed. Install workspace dependencies before running db:migrate.");
}
const Pool = pgModule.Pool ?? pgModule.default?.Pool;
if (!Pool) throw new Error("Unable to load pg.Pool");

const directory = migrationDirectoryFrom(import.meta.url);
const migrations = await loadMigrations(directory);
const manifest = await loadManifest(join(directory, "checksums.json"));
verifyMigrationManifest(migrations, manifest);

const localDatabase = usesLocalDatabase(connectionString);
const pool = new Pool({ connectionString, max: 2, application_name: "buy-local-sparta-migrator" });
try {
  const client = await pool.connect();
  try {
    // CI and local development use plain PostgreSQL/PostGIS rather than a full
    // Supabase stack. Keep the production migration immutable while providing
    // only the minimal Storage topology it references. This is intentionally
    // restricted to loopback hosts and can never bootstrap a remote database.
    if (localDatabase) {
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS storage;
        CREATE TABLE IF NOT EXISTS storage.buckets (
          id text PRIMARY KEY,
          name text NOT NULL UNIQUE,
          public boolean NOT NULL DEFAULT false,
          file_size_limit bigint,
          allowed_mime_types text[]
        )
      `);

      // Migration 0294 indexes the live dropship family projection, which is
      // provisioned by the hosted Supabase schema rather than the plain
      // PostgreSQL migration chain. Give loopback CI the minimal relation
      // shape required to validate immutable migrations without altering the
      // production migration or its registered checksum.
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS bls_private;
        CREATE TABLE IF NOT EXISTS bls_private.storefront_dropship_live_family (
          supplier_id uuid NOT NULL,
          external_product_id text NOT NULL,
          newest_at timestamptz,
          available_until timestamptz,
          min_price_minor bigint,
          sellable boolean NOT NULL DEFAULT false
        )
      `);

      // Hosted Supabase always provides the postgres role. Some migrations grant
      // narrowly scoped runtime privileges to that role, while the plain PostGIS
      // CI image initializes under the configured application user instead.
      // Create a non-login compatibility role only on loopback databases so the
      // immutable production migrations execute under the same role topology.
      await client.query(`
        DO $role$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
            CREATE ROLE postgres NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
          END IF;
        END
        $role$;
      `);

      // Hosted Supabase provides pg_cron. Plain PostGIS CI does not, but immutable
      // migrations legitimately register refresh jobs. On loopback only, provide
      // the minimal pg_cron surface those migrations use so schema replay remains
      // deterministic without requiring the extension in the test container.
      const cronExtension = await client.query(
        "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS installed"
      );
      if (!cronExtension.rows[0]?.installed) {
        await client.query(`
          CREATE SCHEMA IF NOT EXISTS cron;
          CREATE TABLE IF NOT EXISTS cron.job (
            jobid bigserial PRIMARY KEY,
            jobname text NOT NULL UNIQUE,
            schedule text NOT NULL,
            command text NOT NULL
          );

          CREATE OR REPLACE FUNCTION cron.schedule(
            p_jobname text,
            p_schedule text,
            p_command text
          )
          RETURNS bigint
          LANGUAGE plpgsql
          AS $schedule$
          DECLARE v_jobid bigint;
          BEGIN
            INSERT INTO cron.job(jobname,schedule,command)
            VALUES (p_jobname,p_schedule,p_command)
            ON CONFLICT (jobname) DO UPDATE
              SET schedule=EXCLUDED.schedule, command=EXCLUDED.command
            RETURNING jobid INTO v_jobid;
            RETURN v_jobid;
          END
          $schedule$;

          CREATE OR REPLACE FUNCTION cron.unschedule(p_jobname text)
          RETURNS boolean
          LANGUAGE plpgsql
          AS $unschedule$
          DECLARE v_deleted integer;
          BEGIN
            DELETE FROM cron.job WHERE jobname=p_jobname;
            GET DIAGNOSTICS v_deleted = ROW_COUNT;
            RETURN v_deleted > 0;
          END
          $unschedule$;

          CREATE OR REPLACE FUNCTION cron.unschedule(p_jobid bigint)
          RETURNS boolean
          LANGUAGE plpgsql
          AS $unschedule_id$
          DECLARE v_deleted integer;
          BEGIN
            DELETE FROM cron.job WHERE jobid=p_jobid;
            GET DIAGNOSTICS v_deleted = ROW_COUNT;
            RETURN v_deleted > 0;
          END
          $unschedule_id$;
        `);
      }
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        filename text NOT NULL UNIQUE,
        sha256 char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query("SELECT version, filename, sha256 FROM schema_migrations ORDER BY version");
    const byVersion = new Map<number, { filename: string; sha256: string }>(applied.rows.map((row: any) => [Number(row.version), { filename: row.filename, sha256: row.sha256 }]));
    let localCatalogueEmpty: boolean | undefined;

    for (const migration of migrations) {
      const existing = byVersion.get(migration.version);
      if (existing) {
        if (existing.filename !== migration.filename || existing.sha256 !== migration.sha256) {
          throw new Error(`Applied migration ${migration.version} does not match repository checksum`);
        }
        console.log(`skip ${migration.filename}`);
        continue;
      }
      if (localDatabase && (
        EMPTY_CATALOGUE_ENRICHMENT_MIGRATIONS.has(migration.version)
        || EMPTY_CATALOGUE_SCHEMA_PREFIX_MIGRATIONS.has(migration.version)
      )) {
        if (localCatalogueEmpty === undefined) {
          const catalogueState = await client.query(
            "SELECT NOT EXISTS (SELECT 1 FROM public.product_families LIMIT 1) AS empty"
          );
          localCatalogueEmpty = Boolean(catalogueState.rows[0]?.empty);
        }
        if (localCatalogueEmpty) {
          // These immutable migrations enrich exact live catalogue identities and
          // intentionally fail closed when a referenced family is absent. A fresh
          // loopback CI database has no production catalogue, so either record the
          // exact immutable checksum as a data no-op or, for a mixed migration,
          // execute only its catalogue-independent structural prefix first.
          const structuralMarker = EMPTY_CATALOGUE_SCHEMA_PREFIX_MIGRATIONS.get(migration.version);
          const structuralMarkerIndex = structuralMarker ? migration.sql.indexOf(structuralMarker) : -1;
          if (structuralMarker && structuralMarkerIndex <= 0) {
            throw new Error(`Unable to locate structural-prefix marker for migration ${migration.version}`);
          }
          const structuralPrefix = structuralMarkerIndex > 0
            ? migration.sql.slice(0, structuralMarkerIndex)
            : "";

          console.log(`${structuralMarker ? "schema-only" : "no-op"} ${migration.filename} (empty loopback catalogue)`);
          await client.query("BEGIN");
          try {
            await client.query("SELECT pg_advisory_xact_lock(hashtext('buy_local_sparta_schema_migrations'))");
            if (structuralPrefix) await client.query(structuralPrefix);
            await client.query(
              "INSERT INTO schema_migrations(version, filename, sha256) VALUES ($1, $2, $3)",
              [migration.version, migration.filename, migration.sha256]
            );
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }
          continue;
        }
      }

      console.log(`apply ${migration.filename}`);
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('buy_local_sparta_schema_migrations'))");
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations(version, filename, sha256) VALUES ($1, $2, $3)",
          [migration.version, migration.filename, migration.sha256]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
