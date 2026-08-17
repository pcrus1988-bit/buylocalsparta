import { join } from "node:path";
import { loadManifest, loadMigrations, migrationDirectoryFrom, verifyMigrationManifest } from "./migration-lib.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

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

const pool = new Pool({ connectionString, max: 2, application_name: "buy-local-sparta-migrator" });
try {
  const client = await pool.connect();
  try {
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

    for (const migration of migrations) {
      const existing = byVersion.get(migration.version);
      if (existing) {
        if (existing.filename !== migration.filename || existing.sha256 !== migration.sha256) {
          throw new Error(`Applied migration ${migration.version} does not match repository checksum`);
        }
        console.log(`skip ${migration.filename}`);
        continue;
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
